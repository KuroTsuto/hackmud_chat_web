var DEFAULT_CONFIG = {
  polling: {
    base_interval:          1200,  // Minimum interval at which the app hits chats.js
    active_user_threshold:  12000, // How long before users not selected in a while are considered "inactive"
    inactive_user_interval: 6000,  // Minimum time in between polls including "inactive" users
    max_concurrent_polls:   1      // Prevents polls from pilling up when they take a while to complete/parse. Stops request duplication
  },
  token_cookie: 'chat_token'
};

// Event name constants
var EVENTS = {
  INIT:                   'INIT',                   // App has initialized
  LOGIN_PENDING:          'LOGIN_PENDING',          // Started a login attempt
  LOGIN_SUCCESS:          'LOGIN_SUCCESS',          // Chat pass/token accepted
  LOGIN_FAILURE:          'LOGIN_FAILURE',          // Chat pass/token rejected, or a problem occured en-route
  LOGOUT:                 'LOGOUT',                 // Reset application state
  CHANGE_ACTIVE_CHANNEL:  'CHANGE_ACTIVE_CHANNEL',  // Active ChatChannel changed
  CHANGE_ACTIVE_USER:     'CHANGE_ACTIVE_USER',     // Active ChatUser changed
  SEND_MESSAGE_PENDING:   'SEND_MESSAGE_PENDING',   // Sending a message/tell to the server
  SEND_MESSAGE_SUCCESS:   'SEND_MESSAGE_SUCCESS',   // Server accepted message/tell
  SEND_MESSAGE_FAILURE:   'SEND_MESSAGE_FAILURE',   // Server rejected message/tell, or a problem occured en-route
  ADD_CHANNEL:            'ADD_CHANNEL',            // A new ChatChannel has been added
  ADD_CHAT_USER:          'ADD_CHAT_USER',          // A new ChatUser has been added
  ADD_MESSAGE:            'ADD_MESSAGE',            // A new message/tell has been received
  ADD_SYSTEM_MESSAGE:     'ADD_SYSTEM_MESSAGE',     // The controller wants to print something to one or all channels
  REMOVE_CHANNEL:         'REMOVE_CHANNEL',         // A ChatChannel has been removed
  USER_JOINED_CHANNEL:    'USER_JOINED_CHANNEL',    // A 3rd-party user has joined a channel
  USER_LEFT_CHANNEL:      'USER_LEFT_CHANNEL',      // A 3rd-party user has left a channel
  FETCH_MESSAGES_PENDING: 'FETCH_MESSAGES_PENDING', // Started a poll for new messages
  FETCH_MESSAGES_SUCCESS: 'FETCH_MESSAGES_SUCCESS', // Received message data from the server
  FETCH_MESSAGES_FAILURE: 'FETCH_MESSAGES_FAILURE'  // Server rejected message data request, or a problem occured en-route
};

var CHANNEL_TYPES = {
  PUBLIC:  'CHAT',
  PRIVATE: 'TELL'
};

var SCENES = {
  LOGIN: 'LOGIN',
  CHAT:  'CHAT'
}
