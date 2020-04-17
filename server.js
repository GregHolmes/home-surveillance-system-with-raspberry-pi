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

const opentok = new OpenTok(
    process.env.OPENTOK_API_KEY, 
    process.env.OPENTOK_API_SECRET
);

const nexmo = new Nexmo({
    apiKey: process.env.NEXMO_API_KEY,
    apiSecret: process.env.NEXMO_API_SECRET
  })

// Triggers the whole process of creating a session, adding the the session id to the database.
// Opens a headless mode for the publisher view.
// Will send a text message.
createSession();

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

async function startPublish() {
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

  // app.listen(port, () => console.log(`Example app listening at http://localhost:${port}`));
  https.createServer({
    key: fs.readFileSync('./key.pem'),
    cert: fs.readFileSync('./cert.pem'),
    passphrase: 'testpass'
  }, app)
  .listen(port);


  const browser = await puppeteer.launch({
    // headless: true,
    ignoreHTTPSErrors: true,
    args: [
      '--ignore-certificate-errors',
      '--use-fake-ui-for-media-stream'
    ]
  });
  const page = await browser.newPage();

  const context = browser.defaultBrowserContext();
  await context.overridePermissions('https://localhost:3000', ['camera', 'microphone']);

  await page.goto('https://localhost:3000/serve');

  await page.screenshot({path: 'example.png'});
}

   