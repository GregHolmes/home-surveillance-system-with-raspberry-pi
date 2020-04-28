const db = require('./models/index');
const OpenTok = require('opentok');
const Nexmo = require('nexmo');
const puppeteer = require('puppeteer');
const express = require('express');
const app = express();
const path = require('path');
const https = require('https');
const fs = require('fs');
const dotenv = require('dotenv');
const gpio = require('onoff').Gpio;
const pir = new gpio(18, 'in', 'both');
const ngrok = require('ngrok');

dotenv.config();

const opentok = new OpenTok(
    process.env.OPENTOK_API_KEY,
    process.env.OPENTOK_API_SECRET
);

const nexmo = new Nexmo({
    apiKey: process.env.NEXMO_API_KEY,
    apiSecret: process.env.NEXMO_API_SECRET
  })

var canCreateSession = true;

// Triggers the whole process of creating a session, adding the the session id to the database.
// Opens a headless mode for the publisher view.
// Will send a text message.
startServer();

pir.watch(function(err, value) {
    if (value == 1 && canCreateSession == true) {
        canCreateSession = false;
        console.log('Motion has been detected');

        createSession();
    }
});

async function createSession() {
    let session = opentok.createSession({ mediaMode: "routed" }, function(error, session) {
        if (error) {
          console.log("Error creating session:", error);

          return null;
        } else {
          createSessionEntry(session.sessionId);
          sendSMS();
          startPublish();
        }
      });
}

async function createSessionEntry(sessionId) {
    db.Session.create({ sessionId: sessionId, active: true }).then(sessionRow => {
        return sessionRow.id;
      });
}

async function connectNgrok() {
  const url = await ngrok.connect({
    proto: 'http',
    addr: 'https://localhost:3000', 
    subdomain: 'gregdev',
    region: 'eu',
    configPath: '/home/pi/.ngrok2/ngrok.yml',
    onStatusChange: status => { console.log(status)},
    onLogEvent: data => { console.log(data) }
  });
}

function sendSMS() {
    const message = {
      content: {
        type: 'text',
        text: 'Motion has been detected on your camera, please view the link here: ' + process.env.DOMAIN,
      },
    };
    
    nexmo.channel.send(
      { type: 'sms', number: process.env.TO_NUMBER },
      { type: 'sms', number: process.env.NEXMO_BRAND_NAME },
      message,
      (err, data) => { console.log(data.message_uuid); },
      { useBasicAuth: true },
    );
}

async function startServer() {
  const port = 3000;

  app.use(express.static(__dirname + '/public'));
  app.get('/serve', function (req, res) {
    res.sendFile(path.join(__dirname+'/public/server.html'));
  });

  app.get('/client', function (req, res) {
    res.sendFile(path.join(__dirname+'/public/client.html'));
  });

  app.get('/get-details', function (req, res) {
    db.Session.findAll({
      limit: 1,
      where: {
        active: true
      },
      order: [[ 'createdAt', 'DESC' ]]
    }).then(entries => res.json({
      "sessionId": entries[0].sessionId,
      "token": opentok.generateToken(entries[0].sessionId),
      "apiKey": process.env.OPENTOK_API_KEY
    }));
  });

  const httpServer = https.createServer({
    key: fs.readFileSync('./key.pem'),
    cert: fs.readFileSync('./cert.pem'),
    passphrase: 'testpass'
  }, app);

  httpServer.listen(() => {
    connectNgrok();
  });
}

async function startPublish() {
  const browser = await puppeteer.launch({
    headless: true,
    executablePath: 'chromium-browser',
    ignoreHTTPSErrors: true,
    args: [
      '--ignore-certificate-errors',
      '--use-fake-ui-for-media-stream',
      '--no-user-gesture-required',
      '--autoplay-policy=no-user-gesture-required',
      '--allow-http-screen-capture',
      '--enable-experimental-web-platform-features',
      '--auto-select-desktop-capture-source=Entire screen',
    ]
  });
  const page = await browser.newPage();

  const context = browser.defaultBrowserContext();
  await context.overridePermissions('https://localhost:3000', ['camera', 'microphone']);

  await page.goto('https://localhost:3000/serve');

  async function closeSession(page, browser) {
    console.log('Time limit expired. Closing stream');
    await page.close();
    await browser.close();
  }

  setTimeout(closeSession, 60000, page, browser);
  setTimeout(() => { canCreateSession = true }, 70000);
}
