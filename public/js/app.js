// replace these values with those generated in your TokBox Account
var apiKey;
var sessionId;
var token;
var isPublisher = false;
var isSubscriber = false;

async function getDetails(publisher, subscriber, ipAddress) {
  const url = "https://" + ipAddress + ":3000/get-details";
  let request = await fetch(url);
  let response = await request.json();
  
  if (publisher == true) {
    isPublisher = true;
  } 

  if (subscriber == true) {
    isSubscriber = true;
  }

  setDetails(response);
}

function setDetails(details) {
  apiKey = details.apiKey;
  sessionId = details.sessionId;
  token = details.token;

  initializeSession();
}

function initializeSession() {
  var session = OT.initSession(apiKey, sessionId);

  // Subscribe to a newly created stream
  if (isSubscriber == true) {
    session.on('streamCreated', function(event) {
      session.subscribe(event.stream, 'subscriber', {
        insertMode: 'append',
        width: '100%',
        height: '100%'
      }, handleError);
    });
  }
  
  if (isPublisher == true) {
    // Create a publisher
    var publisher = OT.initPublisher('publisher', {
      insertMode: 'append',
      width: '100%',
      height: '100%'
    }, handleError);
  }

  // Connect to the session
  session.connect(token, function(error) {
    // If the connection is successful, publish to the session
    if (error) {
      handleError(error);
    } else if (isPublisher == true) {
      session.publish(publisher, handleError);
    }
  });
}

// Handling all of our errors here by alerting them
function handleError(error) {
  if (error) {
    alert(error.message);
  }
}