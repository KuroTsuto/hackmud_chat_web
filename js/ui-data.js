var UI = (()=>{
	var UI = {};

	function Tabset( subject, $area_container, select_handler ) {
		this.subject         = subject;
		this.$               = $('<div class="tabset">');
		this.$ul             = $('<ul class="tab-list">');
		this.$area_container = $area_container;
		this.tabs            = {};
		this.tab_class       = this.subject + '_tab';
		this.area_class      = this.subject + '_area';

		this.$ul.on( 'click', 'li', function( e ) {
			select_handler( $(this).data( subject ) );
		} );

		this.$.append( this.$ul );
	}
	Tabset.prototype.addTab = function( tab ) {
		this.tabs[ tab.id ] = tab;
		this.$ul.append( tab.$li );
		this.$area_container.append( tab.$div );
		return tab;
	}
	Tabset.prototype.removeTab = function( tab ) {
		if( tab instanceof Tab )
			tab = tab.id;

		this.tabs[ tab ].removeElements();
		delete this.tabs[ tab ];
	}
	Tabset.prototype.createTab = function( id, title ) {
		return this.addTab( new Tab( this, id, name ) );
	}
	Tabset.prototype.select = function( tab ) {
		this.$ul.children( 'li.' + this.tab_class ).removeClass( 'active' );
		this.$area_container.children( 'div.' + this.area_class ).hide();
		tab.$li.addClass( 'active' );
		tab.$div.show();
	}
	Tabset.prototype.clear = function() {
		this.$ul.children().remove();
		this.$area_container.children( this.area_class ).remove();
		this.tabs = {};
	}

	function Tab( tabset, id, title ) {
		if( !title )
			title = id;

		this.id     = id;
		this.tabset = tabset;
		this.$li    = $('<li class="' + tabset.tab_class + '">');
		this.$div   = $('<div id="' + tabset.subject + '-' + id + '" class="' + tabset.area_class + '" style="display: none;">');
		this.unread = 0;

		this.$li.data( tabset.subject, id );
		this.$li.append( title );
	}
	Tab.prototype.setActive = function() {
		this.tabset.select( this );
	}
	Tab.prototype.addMention = function() {
		this.$li.attr( 'data-unread', ++this.unread );
	}
	Tab.prototype.clearMentions = function( num ) {
		this.unread = typeof num == 'number' ? this.unread - num : 0;
		if( this.unread )
			this.$li.attr( 'data-unread', this.unread );
		else
			this.$li.removeAttr( 'data-unread' );
	}
	Tab.prototype.removeElements = function() {
		this.$li.remove();
		this.$div.remove();
	}

	function User( tabset, name, channel_select_handler ) {
		Tab.call( this, tabset, name );
		this.name           = name;
		this.channel_tabset = new UI.Tabset( 'channel', this.$div, channel_select_handler );

		this.$div.append( this.channel_tabset.$ );
	}
	User.prototype = Object.create( Tab.prototype );
	User.prototype.constructor = User;
	User.prototype.addChannel = function( channel ) {
		return this.channel_tabset.addTab( channel );
	}
	User.prototype.createChannel = function( id, name, type, input_handler ) {
		return this.addChannel( new Channel( this.channel_tabset, id, name, this, type, input_handler ) );
	}

	function Channel( tabset, id, name, user, type, input_handler ) {
		Tab.call( this, tabset, id, Channel.formatTitle( name, type ) );
		this.name     = name;
		this.user     = user;
		this.messages = new MessageList( this, user.name, type == CHANNEL_TYPES.PRIVATE );
		this.input    = new MessageInput( this, input_handler );

		this.$div.append( this.messages.$ ).append( this.input.$ );
		this.input.$input.keydown((e) => {
			let keycode = e.which;

			if(keycode == 34) { // PgDn
				this.messages.pgDn();
			} else if(keycode == 33) { // PgUp
				this.messages.pgUp();
			}
		});
	}
	Channel.prototype = Object.create( Tab.prototype );
	Channel.prototype.constructor = Channel;
	Channel.prototype.addMention = function() {
		Tab.prototype.addMention.call( this );
		this.user.addMention();
	}
	Channel.prototype.addMessage = function( id, user, time, msg ) {
		this.messages.addMessage( id, user, time, msg );
	}
	Channel.prototype.clearMentions = function() {
		this.user.clearMentions( this.unread );
		Tab.prototype.clearMentions.call( this );
	}
	Channel.prototype.setActive = function() {
		this.clearMentions();
		this.tabset.select( this );
		this.messages.scrollToBottom();
	}
	Channel.formatTitle = function( name, type ) {
		let type_indicator;

		if(type == CHANNEL_TYPES.PRIVATE) {
			type_indicator = '@';
		}
		else {
			type_indicator = '#';
		}

		return '<span class="col-C">' + type_indicator + '</span>' + name;
	}

	function MessageList( channel, username, always_notify = false ) {
		List.call( this );

		this.user          = username;
		this.channel       = channel;
		this.always_notify = always_notify;
		this.$             = $( '<ul class="message_list">' );

		this.$.scroll( () => this.channel.clearMentions() );
	}
	MessageList.prototype = Object.create( List.prototype );
	MessageList.prototype.constructor = MessageList;
	MessageList.prototype.addMessage = function( id, user, time, msg ) {
		let at_bottom  = this.$[0].scrollHeight - this.$.scrollTop() == this.$.height();
		let span = MessageList.formatMessage( user, time, msg );
		let class_list = ['message'];

		if( msg.match(new RegExp('@'+this.user+'\\b')) ) {
			this.channel.addMention();
			class_list.push('mention');
		}
		else if( this.always_notify && user != this.username ) {
			this.channel.addMention();
		}
		if (settings.ignore_list.includes(user)) {
			class_list.push('ignore');
		}

		List.prototype.add.call( this, id, this.write( span, class_list ) );
		if( at_bottom )
			this.scrollToBottom();
	}
	MessageList.prototype.safeWrite = function(str, classes ) {
		return this.write( escapeHtml(str), classes );
	}
	MessageList.prototype.scrollToBottom = function() {
		this.$.scrollTop(1e10); // just scroll down a lot
	}
	MessageList.prototype.write = function( html, classes = [] ) {
		let li = $('<li class="' + classes.join(' ') + '">');
		li.html( html );
		this.$.append( li );
		return li;
	}
	MessageList.prototype.writeError = function( msg, classes = [] ) {
		return this.write( '::: ' + msg + ' :::', classes.concat([ 'error', 'trust' ]) );
	}
	MessageList.prototype.pgUp = function() {
		let height = this.$.height();
		let currTop = this.$.scrollTop();

		this.$.scrollTop(currTop - height);
	}
	MessageList.prototype.pgDn = function() {
		let height = this.$.height();
		let currTop = this.$.scrollTop();

		this.$.scrollTop(currTop + height);
	}
	MessageList.colorizeScripts = ( msg ) => {
		let trustUsers = [
			'accts',
			'autos',
			'chats',
			'corps',
			'escrow',
			'gui',
			'kernel',
			'market',
			'scripts',
			'sys',
			'trust',
			'users'
		];

		return msg.replace(/(#s.|[^#\.a-z0-9_]|^)([a-z_][a-z0-9_]*)\.([a-z_][a-z0-9_]*)/g, function(match, pre, username, script) {
			let colorCode = trustUsers.indexOf(username) !== -1 ? 'F' : 'C';

			return UI.replaceColorCodes(pre + '`' + colorCode + username + '`.`L' + script + '`');
		});
	}
	MessageList.colorizeMentions = ( msg ) => {
		return msg.replace(/@(\w+)(\W|$)/g, function(match, name, endPad) {
			return UI.replaceColorCodes('`C@`' + UI.colorizeUser(name) + endPad);
		});
	}
	MessageList.formatMessage = function( user, time, msg ) {
		let date = new Date(time * 1000);
		let timestr = [date.getHours(), date.getMinutes()].map(a => ('0' + a).slice(-2)).join(":");
		let coloredUser = UI.replaceColorCodes( UI.colorizeUser( user ) );
		msg = escapeHtml(msg);
		msg = MessageList.colorizeMentions(msg);
		msg = MessageList.colorizeScripts(msg);
		msg = UI.replaceColorCodes(msg).replace(/\n/g, '<br>');

		return '<span class="timestamp">' + timestr + "</span> " + coloredUser + ' <span class="msg-content">' + msg + '</span>';
	}

	function MessageInput( channel, input_handler ) {
		this.channel = channel;
		this.$ = $('<form action="">');
		this.$input = $('<input type="text" class="chat-input">');
		this.input_handler = input_handler;

		this.$.append( this.$input );

		if( !settings.skip_help )
			this.$input.attr("placeholder", "/help");

		this.$.keydown( () => this.channel.clearMentions() );
		this.$.submit( ( e ) => {
			this.handleInput( this.$input.val() );
			return false;
		} );
	}
	MessageInput.prototype.handleInput = function( msg ) {
		try {
			if(msg.trim().length == 0)
				return false;

			this.input_handler( this.channel, msg );

			this.$input.val('');
		} catch (e) {
			console.error(e);
		}
	}

	UI.Tabset = Tabset;
	UI.Tab = Tab;
	UI.User = User;
	UI.Channel = Channel;
	UI.MessageList = MessageList;

	UI.colorCallback = ( not_used, p1, p2 ) => {
		let css = (p1.match(/[A-Z]/) ? 'col-cap-' : 'col-') + p1;
		return '<span class="' + css + '">' + p2 + '</span>';
	}

	UI.colorizeUser = ( user ) => {
		let valid_colors = "BEFGHIJLMNQUVWY";
		let num_colors = valid_colors.length;

		let hash = user.split("").map(e => e.charCodeAt(0)).reduce((a, e) => a+e, 0);
		let colorCode = valid_colors.charAt((user.length + hash) % num_colors);
		let colorized = '`' + colorCode + user + "`";

		return colorized;
	}

	UI.replaceColorCodes = function( string ) {
		return string.replace(/`([0-9a-zA-Z])([^:`\n]{1,2}|[^`\n]{3,}?)`/g, UI.colorCallback);
	}

	return UI;
})();
