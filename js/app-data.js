/**
 * [ChatUser description]
 * @param {User} api_user API User object
 */
function ChatUser( api_user ) {
  this.name        = api_user.name;
  this.api_user    = api_user;
  this.last_active = Date.now();
  this.channels    = new ChannelList();

  Object.keys( api_user.channels ).forEach( name => {
    this.channels.add( new PublicChannel( this, api_user.channels[ name ] ) )
  });
}
ChatUser.prototype.addChannel = function( channel ) {
  return this.channels.add( channel );
}
ChatUser.prototype.getChannel = function( id ) {
  return this.channels.get( id );
}
ChatUser.prototype.getChannels = function() {
  return this.channels.values();
}
ChatUser.prototype.getChannelNames = function() {
  return this.channels.keys();
}
ChatUser.prototype.inChannel = function( id ) {
  return this.channels.has( id );
}
ChatUser.prototype.removeChannel = function( id ) {
  return this.channels.remove( id );
}
ChatUser.prototype.sendTell = function( recipient, msg ) {
  return this.api_user.tell( recipient, msg );
}
ChatUser.prototype.updateLastActive = function( time ) {
  this.last_active = time || Date.now();
}

function ChatUserList( users ) {
  List.call( this, users );
}
ChatUserList.prototype = Object.create( List.prototype );
ChatUserList.prototype.constructor = ChatUserList;
ChatUserList.prototype.add = function( user ) {
  return List.prototype.add.call( this, user.name, user );
}
ChatUserList.prototype.getActive = function( max_inactivity ) {
  let threshold = Date.now() - max_inactivity;
  let users     = [];

  for( let name of this.ids )
    if( this.items[ name ].last_active > threshold ) users.push( name );

  return users;
}
ChatUserList.prototype.getAllNames = function() {
  return this.keys();
}

/**
 * [ChatChannel description]
 * @param {ChatUser} user
 * @param {string} name
 * @param {string} type
 * @param {Channel} api_channel API Channel object
 */
function ChatChannel( user, name, type, api_channel ) {
  this.id          = ChatChannel.nextID();
  this.user        = user;
  this.name        = name;
  this.type        = type;
  this.api_channel = api_channel;
  this.messages    = new List();

  user.channels.add( this );
}
ChatChannel.prototype.send = function( msg ) {
  return this.api_channel.send( msg );
}
ChatChannel.prototype.addMessage = function( id, msg ) {
  return this.messages.add( id, msg );
}
ChatChannel.prototype.getUsers = function() {
  return this.api_channel.users;
}
ChatChannel.prototype.getLastMessageTime = function() {
  return this.api_channel.last;
}
ChatChannel.prototype.hasMessage = function( id ) {
  return this.messages.has( id );
}
ChatChannel.prototype.hasUser = function( name ) {
  return this.api_channel.users.indexOf( name ) > -1;
}
ChatChannel._nextID = 0;
ChatChannel.nextID = () => ChatChannel._nextID++;

/**
 * [PublicChannel description]
 * @param {ChatUser} user
 * @param {Channel} api_channel API Channel object
 */
function PublicChannel( user, api_channel ) {
  ChatChannel.call( this, user, api_channel.name, CHANNEL_TYPES.PUBLIC, api_channel );
}
PublicChannel.prototype = Object.create( ChatChannel.prototype );
PublicChannel.prototype.constructor = PublicChannel;

/**
 * [PrivateChannel description]
 * @param {ChatUser} user
 * @param {string} correspondant
 */
function PrivateChannel( user, correspondant ) {
  ChatChannel.call( this, user, correspondant, CHANNEL_TYPES.PRIVATE );
  this.correspondant = correspondant;
}
PrivateChannel.prototype = Object.create( ChatChannel.prototype );
PrivateChannel.prototype.constructor = PrivateChannel;
PrivateChannel.prototype.send = function( msg ) {
  return this.user.sendTell( this.correspondant, msg );
}

/**
 * [ChannelList description]
 */
function ChannelList( channels ) {
  List.call( this, channels );

  this.lookup_table = {}; // ID cache organized by TYPE => NAME => ID for fast lookups
}
ChannelList.prototype = Object.create( List.prototype );
ChannelList.prototype.constructor = ChannelList;
ChannelList.prototype.add = function( channel ) {
  if( !this.lookup_table[ channel.type ] )
    this.lookup_table[ channel.type ] = {};

  this.lookup_table[ channel.type ][ channel.name ] = channel.id;
  return List.prototype.add.call( this, channel.id, channel );
}
ChannelList.prototype.lookup = function( name, type ) {
  return this.lookup_table[ type ] && this.lookup_table[ type ][ name ];
}
ChannelList.prototype.remove = function( id ) {
  let channel = this.get( id );
  delete this.lookup_table[ channel.type ][ channel.name ];
  return List.prototype.remove.call( this, id );
}
