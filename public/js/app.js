// replace these values with those generated in your TokBox Account
var apiKey;
var sessionId;
var token;

getDetails();

// Handling all of our errors here by alerting them
function handleError(error) {
    if (error) {
      alert(error.message);
    }
}

function initializeSession() {
  var session = OT.initSession(apiKey, sessionId);

  // Subscribe to a newly created stream
  session.on('streamCreated', function(event) {
    session.subscribe(event.stream, 'subscriber', {
      insertMode: 'append',
      width: '100%',
      height: '100%'
    }, handleError);
  });

  // Create a publisher
  var publisher = OT.initPublisher('publisher', {
    insertMode: 'append',
    width: '100%',
    height: '100%'
  }, handleError);

  // Connect to the session
  session.connect(token, function(error) {
    // If the connection is successful, publish to the session
    if (error) {
      handleError(error);
    } else {
      session.publish(publisher, handleError);
    }
  });
}

async function getDetails() {
  const url = 'http://192.168.1.234:3000/get-details';
  let request = await fetch(url);
  let response = await request.json();

  setDetails(response);
}

function setDetails(details) {
  apiKey = details.apiKey;
  sessionId = details.sessionId;
  token = details.token;

  initializeSession();
}
