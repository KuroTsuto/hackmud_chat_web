/**
 * Application "controller" - business logic container & application state management.
 * Dispatches events describing state changes.
 *
 * NOTE: functions dispatching async events present possible (if improbable) race conditions in
 * their current state. If the app should wait for the UI to handle a "pending" event, the
 * respective function should be modified to .then() - chain the main function body onto the
 * .emit( PENDING ) dispatch.
 */
function App( options ) {
  EventEmitter.call( this ); // super constructor

  let config = $.extend( true, DEFAULT_CONFIG, options );

  // Settings & configuration - these persist through logout. See constants.js for info on some
  this.config                    = config;
  this.settings                  = new Settings();
  this.polling_interval          = config.polling.base_interval;
  this.inactive_polling_interval = config.polling.inactive_user_interval;
  this.pending_polls             = [];
  this.max_concurrent_polls      = config.polling.max_concurrent_polls;

  // Initialize state
  this.resetState();
}
App.prototype = Object.create( EventEmitter.prototype );
App.prototype.constructor = App;

/**
 * @param {ChatChannel} channel
 */
App.prototype.addChannel = function( channel ) {
  if( this.channels.has( channel.id ) )
    return;

  this.channels.add( channel );

  return this.emit( EVENTS.ADD_CHANNEL, {
    user: channel.user.name,
    name: channel.name,
    id:   channel.id,
    type: channel.type
  } );
}

App.prototype.addMessage = function( channel_id, msg ) {
  let channel = this.channels.get( channel_id );

  if( channel.hasMessage( msg.id ) )
    return;

  let message = {
    id:      msg.id,
    user:    msg.from_user,
    time:    msg.t,
    msg:     msg.msg,
    channel: channel_id
  };

  channel.addMessage( msg.id, message );
  return this.emit( EVENTS.ADD_MESSAGE, message );
}

App.prototype.addSystemMessage = function( msg, channel_id, type ) {
  return this.emit( EVENTS.ADD_SYSTEM_MESSAGE, {msg: msg, channel: channel_id, type: type} );
}

/**
 * Creates a new ChatUser from an API User object and adds it to state.
 * @param {User} api_user API User object
 * @return {Promise} Resolves after the ADD_USER and all ADD_CHANNEL event handlers return
 */
App.prototype.addUser = function( api_user ) {
  let user = this.users.add( new ChatUser( api_user ) );
  return this.emit( EVENTS.ADD_CHAT_USER, user.name )
    .then(() => Promise.all(
      user.getChannels().map( channel => this.addChannel( channel ) )
    ));
}

/**
 * Get a saved chat token from cookie
 * @return {[type]}
 */
App.prototype.getToken = function() {
  return readCookieValue( this.config.token_cookie );
}

App.prototype.handleSlashTell = function( in_channel, from, to, msg ) {
  let user       = this.users.get( from );
  let channel_id = user.channels.lookup( to, CHANNEL_TYPES.PRIVATE );

  // If this user already has a channel with the recipient, immediately send the tell and swap to the channel
  if( channel_id )
    return this.sendMessage( channel_id, msg ).then( data => this.setActiveChannel( data.channel ) );

  // If recipient's existance is unknown, optimistically create a new PrivateChannel instance for the conversation,
  // and swap to it. But swap back, remove the channel, and forward the error message if the tell fails
  return this.addChannel( new PrivateChannel( user, to ) )
    .then( channel => this.sendMessage( channel.id, msg ) )
    .then( data => this.setActiveChannel( data.channel ) )
    .catch( data => {
      if( this.active_user.name == from ) {
        return this.setActiveChannel( in_channel )
          .then( () => this.removeChannel( data.channel ) )
          .then( () => Promise.reject( data ) );
      }

      return this.removeChannel( data.channel ).then( () => Promise.reject( data ) );
    });
}

/**
 * Initialize the application. Called at jQuery document.ready();
 * @return {Promise}
 */
App.prototype.init = function() {
  this.settings.ready();

  let token = this.getToken();
  if( token )
    return this.login( token ).then( () => this.emit( EVENTS.INIT, true ) );
  else
    return this.emit( EVENTS.INIT, false );
}

/**
 * Checks if the app will poll for messages
 * @return {boolean}
 */
App.prototype.isPolling = function() {
  return !!this.polling_interval_id;
}

/**
 * Log out from the application. Defers state reset and event dispatch until polling has stopped
 * @return {Promise} - resolves when the UI is finished handling the LOGOUT event
 */
App.prototype.logout = function() {
  return this.stopPolling().then(() => {
    this.resetState();
    deleteCookieValue( this.config.token_cookie );
    return this.emit( EVENTS.LOGOUT );
  });
}

/**
 * Attempt to retrieve token/Account data from the API using the specified token/pass
 * @param  {string} pass chat_pass or token
 * @return {Promise}
 */
App.prototype.login = function( pass ) {
  this.emit( EVENTS.LOGIN_PENDING );

  return this.account.login( pass )
    .catch( ( err ) => {
      return this.emit( EVENTS.LOGIN_FAILURE, err ).then( () => Promise.reject( err ) );
    } )
    .then( ( account ) => {
      writeCookieValue( this.config.token_cookie, account.token );

      let usernames = Object.keys( account.users );
      for( let i = 0; i < usernames.length; i++ )
        this.addUser( account.users[ usernames[i] ] );

      return this.emit( EVENTS.LOGIN_SUCCESS );
    } )
    .then( () => this.startPolling() ); // Start polling only after all LOGIN_SUCCESS handlers return
}

/**
 * Query and consume new message data from the API
 * @return {Promise}
 */
App.prototype.pollForUpdates = function() {
  let users;

  // Avoid pilling up pending polls
  if( this.pending_polls.length >= this.max_concurrent_polls )
    return debugLog( 'Poll Deferred' );

  if( Date.now() > this.last_inactive_poll + this.inactive_polling_interval )
    users = this.users.getAllNames();
  else
    users = this.users.getActive( this.config.polling.active_user_threshold );

  if( !users.length )
    return;

  this.emit( EVENTS.FETCH_MESSAGES_PENDING, users );
  let poll_id = this.pending_polls.length;
  this.pending_polls[ poll_id ] = this.account.poll( {after:"last"}, users )
    .catch( err => { this.emit( EVENTS.FETCH_MESSAGES_FAILURE, err ); this.pending_polls.splice( poll_id, 1 ); return Promise.reject( err ); } )
    .then( data => Promise.all(
      Object.keys( data.chats ).map( username => {
        let user = this.users.get( username )
        let user_chans = user.channels;
        let new_chans = {}; // A mapping of TYPE => NAME => channel creation promise for missing channels
        new_chans[ CHANNEL_TYPES.PUBLIC ] = {};
        new_chans[ CHANNEL_TYPES.PRIVATE ] = {};

        return Promise.all(
           // Map message "channel" properties to respective channel IDs. Create or wait for the creation of missing ChatChannels when necessary
          data.chats[ username ].map( m => {
            let chan_name = m.channel || (m.from_user == username ? m.to_user : m.from_user);
            let chan_type = m.channel ? CHANNEL_TYPES.PUBLIC : CHANNEL_TYPES.PRIVATE;
            m.channel = user_chans.lookup( chan_name, chan_type );

            if( m.channel )
              return m;

            if( new_chans[ chan_type ][ chan_name ] )
              return new_chans[ chan_type ][ chan_name ].then( chan => { m.channel = chan.id; return m; } );

            if( CHANNEL_TYPES.PRIVATE == chan_type ) {
              return new_chans[ chan_type ][ chan_name ] = this.addChannel( new PrivateChannel( user, chan_name ) )
                .then( chan => { m.channel = chan.id; return m } );
            }
            else {
              //TODO: dynamic PublicChannel creation - this requires some modifications to the API Channel data-type (or manually forcing new Channel instances into API state)
              console.error('Not implemented: chats.join after app load');
            }
          })
        )
        // Add the messages to respective channels
        .then( msgs => msgs.forEach( m => this.addMessage( m.channel, m ) ) );
      })
    ))
    .then( () => { this.pending_polls.splice( poll_id, 1 ); return this.emit( EVENTS.FETCH_MESSAGES_SUCCESS, users ); } );

    return this.pending_polls[ poll_id ];
}

App.prototype.removeChannel = function( channel_id ) {
  this.channels.get( channel_id ).user.removeChannel( channel_id );
  this.channels.remove( channel_id );

  return this.emit( EVENTS.REMOVE_CHANNEL, channel_id );
}

/**
 * Reset application state
 */
App.prototype.resetState = function() {
  this.users               = new ChatUserList();
  this.channels            = new ChannelList();
  this.account             = new Account();
  this.active_user         = null;
  this.active_channel      = null;
  this.last_inactive_poll  = 0;
  this.polling_interval_id = null;
}

App.prototype.sendMessage = function( channel_id, msg ) {
  let payload = {channel: channel_id, msg: msg};

  this.emit( EVENTS.SEND_MESSAGE_PENDING, payload );
  return this.channels.get( channel_id ).send( msg )
    .catch( e => {
      let error = {};

      if( typeof e == 'string' ) {
        error.msg = e;
      }
      else {
        if( e.statusCode )
          error.status = e.statusCode;

        if( e.body && e.body.msg )
          error.msg = e.body.msg;
      }

      payload.error = error;
      return this.emit( EVENTS.SEND_MESSAGE_FAILURE, payload )
        .then( () => Promise.reject( payload ) );
    })
    .then( this.emit( EVENTS.SEND_MESSAGE_SUCCESS, payload ) )
    .then( () => payload );
}

/**
 * Change the active channel
 * @param  {number} channel_id
 * @return {Promise}
 */
App.prototype.setActiveChannel = function( channel_id ) {
  if( !this.active_user )
    throw new Error( 'Cannot set active channel - no active user' );

  if( this.active_channel && this.active_channel.id == channel_id )
      return Promise.resolve( channel_id );

  let channel = this.active_user.getChannel( channel_id );
  if( !channel )
    throw new Error( 'Unknown channel "' + channel_id + '"' );

  this.active_channel = channel;
  return this.emit( EVENTS.CHANGE_ACTIVE_CHANNEL, channel_id );
}

/**
 * Change the active ChatUser
 * @param  {string} name
 * @return {[type]}
 */
App.prototype.setActiveUser = function( name ) {
  if( !this.users.has( name ) )
    throw new Error( 'Unknown user "' + name + '"' );

  if( this.active_user ) {
    if( name == this.active_user.name )
      return;

    this.active_user.updateLastActive();
  }

  this.active_user = this.users.get( name );
  return this.emit( EVENTS.CHANGE_ACTIVE_USER, name );
}

/**
 * Set the message polling interval
 * @param  {number} interval
 * @returns {Promise} - resolves when the new interval has taken effect
 */
App.prototype.setPollingInterval = function( interval ) {
  this.polling_interval = interval;

  if( this.isPolling() )
    return this.stopPolling().then( () => this.startPolling() );

  return Promise.resolve();
}

/**
 * Start polling the API for message data
 */
App.prototype.startPolling = function() {
  if( this.isPolling() )
    throw new Error( 'Already polling for updates' );

  this.pending_polls = [];
  this.polling_interval_id = setInterval(()=>this.pollForUpdates(), this.polling_interval);
}

/**
 * Stop polling the API for message data
 * @returns {Promise} - resolves when all pending polls have finished.
 */
App.prototype.stopPolling = function() {
  clearInterval( this.polling_interval_id );
  this.polling_interval_id = null;
  return Promise.all( this.pending_polls.map( p => p.catch( () => p ) ) );
}
