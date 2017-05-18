/**
 * Utilities
 */
var DEBUG = localStorage.debug;
function debugLog( o ) {
	if( !DEBUG )
		return;

	if( 'function' == typeof o )
		o = o();

	if( o instanceof Error )
		throw o;
	else
		console.log( o );
}

function readCookieValue(key) {
	return document.cookie.replace(new RegExp('(?:(?:^|.*;\\s*)' + key + '\\s*\\=\\s*([^;]*).*$)|^.*$'), "$1");
}

function writeCookieValue(key, value) {
	document.cookie = key + '=' + value;
}

function deleteCookieValue(key) {
	document.cookie = key + '=foobar; expires=Thu, 01 Jan 1970 00:00:00 GMT';
}

function escapeHtml(str) {
	return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function EventEmitter() {
	this.event_handlers = {};
}
/**
 * Promisified event emitter - returns a promise which resolves when all event handlers have
 * returned (or resolved, if they return a promise). Detaches handlers if they return (or resolve
 * with) a truthy value, or they complete a limited run.
 * @param  {[type]} e
 * @param  {[type]} data
 * @return {Promise}
 */
//TODO: got a little carried away here - should probably test if the extra features add noteworthy overhead
EventEmitter.prototype.emit = function( e, data ) {
	debugLog( () => this.constructor.name + ': ' + e );

	if (!e) throw new Error('No event name supplied');
  let handlers = this.event_handlers[ e ];

  if ( !handlers )
    return Promise.resolve( data );

  return Promise.all( handlers.map( h => h.callback( data ) ) )
		.catch( hrs => { console.log('emission error:' ); console.log( hrs); return hrs; } )
    .then( hrs => hrs.forEach( (remove, i) => {
      // Remove event handler if it returned true, or if it finishes a limited run
      if( remove || handlers[i].times && --handlers[i].times == 0 )
        handers.splice( i, 1 );
    }))
    .then( () => data );
}
/**
 * Detach an event handler from an event
 * @param  {[type]}   e
 * @param  {Function} callback
 * @return {object}
 */
EventEmitter.prototype.off = function( e, callback ) {
  let handlers = this.event_handlers[ e ];

  if ( !handlers )
    return;

  for ( let i = handlers.length - 1; i >= 0; i-- ) {
    if( handlers[ i ].callback === callback )
      return handlers.splice( i, 1 );
  }
}
/**
 * Add an event handler
 * @param  {[type]}   e
 * @param  {Function} callback
 * @param  {Number}   [times=0] Automatically detach the handler after this many events. `0` disables this behaviour
 */
EventEmitter.prototype.on = function( e, callback, times = 0 ) {
  let handler = {
    callback: callback
  };

  if ( times )
    handler.times = times;

  if( !this.event_handlers[ e ] )
    this.event_handlers[ e ] = [ handler ];
  else
    this.event_handlers[ e ].push( handler );
}

function List( items ) {
  this.ids   = items ? Object.keys( items ) : [];
  this.items = items || {};
}
List.prototype.add = function( id, item ) {
  if( this.has( id ) )
    return false;

  this.ids.push( id );
  this.items[ id ] = item;
  return item;
}
List.prototype.filter = function( callback ) {
	return this.ids.reduce( (matches, id) => {
		let item = this.items[ id ];
		if( callback( item, id, this ) )
			matches[ id ] = item;

		return matches;
	}, {} );
}
List.prototype.find = function( callback ) {
	let id = this.findId( callback );
	return id ? this.items[ id ] : id;
}
List.prototype.findId = function( callback ) {
	for( let id of this.ids ) {
		if( callback( this.items[ id ], id, this ) )
			return id;
	}
}
List.prototype.get = function( id ) {
  return this.items[ id ];
}
List.prototype.has = function( id ) {
  return this.ids.indexOf( id ) > -1;
}
List.prototype.keys = function() {
	return this.ids;
}
List.prototype.remove = function( id ) {
  let i = this.ids.indexOf( id );

  if( i == -1 )
    return false;

  this.ids.splice( i, 1 );
  let item = this.items[ id ];
  delete this.items[ id ];
  return item;
}
List.prototype.values = function() {
	return this.ids.map( id => this.items[ id ] );
}
