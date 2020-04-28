const db = require('./models/index');
const OpenTok = require('opentok');
const Nexmo = require('nexmo');
const puppeteer = require('puppeteer');
const express = require('express');
const app = express();
const path = require('path');
const https = require('https');
const fs = require('fs');
require('dotenv').config();
const gpio = require('onoff').Gpio;
const pir = new gpio(18, 'in', 'both');
const ngrok = require('ngrok');

const opentok = new OpenTok(
    process.env.OPENTOK_API_KEY,
    process.env.OPENTOK_API_SECRET
);

const nexmo = new Nexmo({
    apiKey: process.env.NEXMO_API_KEY,
    apiSecret: process.env.NEXMO_API_SECRET
  })

let canCreateSession = true;
// Triggers the whole process of creating a session, adding the the session id to the database.
// Opens a headless mode for the publisher view.
// Will send a text message.
startServer();

pir.watch(function(err, value) {
    console.log('oh?');
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
          // sendSMS();
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
    console.log('testing');
  const url = await ngrok.connect({
    proto: 'http', // http|tcp|tls, defaults to http
    addr: 'https://localhost:3000', // port or network address, defaults to 80
    subdomain: 'gregdev', // reserved tunnel name https://alex.ngrok.io
    region: 'eu', // one of ngrok regions (us, eu, au, ap), defaults to us
    configPath: '/home/pi/.ngrok2/ngrok.yml', // custom path for ngrok config file
    onStatusChange: status => { console.log(status)}, // 'closed' - connection is lost, 'connected' - reconnected
    onLogEvent: data => { console.log(data) }
  });
    console.log(url);
    console.log('endtesting');
}

// function sendSMS() {
//     const from = process.env.NEXMO_BRAND_NAME;
//     const to = process.env.TO_NUMBER;
//     const text = 'Motion has been detected on your camera, please view the link here:';

//     nexmo.message.sendSms(from, to, text, (err, responseData) => {
//         if (err) {
//             console.log(err);
//         } else {
//             if(responseData.messages[0]['status'] === "0") {
//                 console.log("Message sent successfully.");
//             } else {
//                 console.log(`Message failed with error: ${responseData.messages[0]['error-text']}`);
//             }
//         }
//     });
// }
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

  httpServer.listen(port, (err) => {
    if (err) return console.log(`Something bad happened: ${err}`);
    console.log(`Node.js server listening on ${port}`);

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
    console.log('delay expired');
    await page.close();
    await browser.close();
  }

  setTimeout(closeSession, 60000, page, browser);
  setTimeout(() => { canCreateSession = true }, 70000);
}
