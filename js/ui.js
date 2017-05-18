var ui = {
	$root: null,
	$scenes: {},  // Distinct top-level presentations
	channels: {}, // Channel state & reference cache, keyed by channel id
	users: {},    // User state & reference cache, keyed by user name
	user_tabset: null,
	$pass_input: null
};

// Slash command handlers keyed by command. "this" is bound to the MessageList corresponding to the
// channel whose <input> received the command.
ui.slash_commands = {
	color: function( color_code ) {
		if (color_code) {
			if(/^[a-z0-5]$/i.test(color_code) || color_code == 'none') {
				settings.setColor(color_code);
				this.write('Set chat color to "' + color_code + '". Sample: "' + UI.colorCallback(null, color_code, 'foo bar baz') + '"');
			}
			else {
				this.write("Invalid color code. Please specify a single letter, or a number in the range 0-5.");
			}
		} else {
			if (settings.color_code) {
				color_code = settings.color_code;
				this.write('Current chat color is "' + color_code + '". Use "/color none" to unset. Sample: "' + UI.colorCallback(null, color_code, 'foo bar baz') + '"');
			} else {
				this.safeWrite("Currently using the default chat color.");
			}
		}
	},
	help: function() {
		this.safeWrite('Commands: /help, /ignore <user>, /color <letter|color code|none>, /tell <user> <optional message>, /users');
		if (!settings.skip_help) {
			ui.scenes.chat.find("input").attr("placeholder", null)
			settings.setSkipHelp(true);
		}
	},
	ignore: function( username ) {
		if (username) {
			settings.addIgnore(username);
			this.safeWrite("Ignored " + username);
		} else {
			this.safeWrite("Ignore list: " + settings.ignore_list.join(", "));
		}
	},
	tell: function( username, msg ) {
		if (username) {
			app.handleSlashTell( this.channel.id, this.channel.user.name, username, msg )
				.catch( data => {
					this.writeError(data.error.msg)
					this.scrollToBottom();
				});
		} else {
			this.safeWrite("Please specify a user to open a conversation with");
		}
	},
	users: function() {
		//HACK: should probably either implement handleSlashUsers on the controller, a more general
		//interface for controller slash commands, or keep user list in view state
		var u=app.channels.get( this.channel.id ).getUsers().sort();
		var max=Math.max.apply(null,u.map(u=>u.length))+1
		u=u.map(u=>"<pre class='nobreak'>"+u+"&nbsp;".repeat(max-u.length)+"</pre>");
		this.write("<span class='break'>"+u.join(' ')+"</span>");
	}
};

ui.init = function( app, root ) {
	ui.$root = $(root);
	ui.$scenes.login = $('#chat_pass_login');
	ui.$pass_input = $('#chat_pass_input');
	ui.$scenes.chat = $('#chat_area');
	ui.user_tabset = new UI.Tabset( 'user', ui.$scenes.chat, username => app.setActiveUser( username ) );

	ui.$scenes.chat.append( ui.user_tabset.$ );
	ui.$pass_input.on( 'change', function() {
		let pass = $(this).val().trim();
		if( !pass ) {
			$(this).val('');
		}
		else {
			app.login( pass );
		}
	});

	app.on( EVENTS.ADD_CHANNEL, channel => {
		ui.channels[ channel.id ] = ui.users[ channel.user ].createChannel( channel.id, channel.name, channel.type, ui.handleInput );
	});

	app.on( EVENTS.ADD_CHAT_USER, username => {
		ui.users[ username ] = ui.user_tabset.addTab(
			new UI.User( ui.user_tabset, username, channel_id => app.setActiveChannel( channel_id ) )
		);
	});

	app.on( EVENTS.ADD_MESSAGE, msg => {
		ui.channels[ msg.channel ].addMessage( msg.id, msg.user, msg.time, msg.msg );
	});

	app.on( EVENTS.ADD_SYSTEM_MESSAGE, msg => {
		ui.channels[ msg.channel ].messages.safeWrite( msg.msg );
	});

	app.on( EVENTS.CHANGE_ACTIVE_CHANNEL, channel_id => {
		ui.channels[ channel_id ].setActive();
	});

	app.on( EVENTS.CHANGE_ACTIVE_USER, username => {
		ui.users[ username ].setActive();
	});

	app.on( EVENTS.INIT, (is_logged_in) => {
		if( is_logged_in )
			return;

		ui.changeScene( 'login' );
		ui.$pass_input.focus();
	});

	app.on( EVENTS.LOGIN_FAILURE, ( e ) => {
		//TODO: better error parsing in the controller
		let error = e.body && e.body.msg;

		if( !error )
			error = 'an error occured (' + e.statusCode + ')';

		ui.$pass_input.removeAttr( 'disabled' ).attr( 'placeholder', ui.$pass_input.val() + ': ' + error ).val('');
		ui.changeScene( 'login' );
		ui.$pass_input.focus();
	});

	app.on( EVENTS.LOGIN_PENDING, () => {
		ui.$pass_input.attr( 'disabled', 'disabled' ).removeAttr('placeholder');
	});

	app.on( EVENTS.LOGIN_SUCCESS, () => {
		ui.$pass_input.removeAttr( 'disabled' ).val('');
		ui.changeScene( 'chat' );
	});

	app.on( EVENTS.LOGOUT, () => {
		ui.changeScene( 'login' );
		ui.user_tabset.clear();
		ui.channels = {};
		ui.users = {};
	});

	app.on( EVENTS.REMOVE_CHANNEL, channel_id => {
		let channel = ui.channels[ channel_id ];
		channel.tabset.removeTab( channel_id );
		delete ui.channels[ channel_id ];
	});
}

ui.changeScene = function( scene ) {
	let names = Object.keys( ui.$scenes );
	for(let i = names.length - 1; i >= 0; i--) {
		if( scene == names[ i ] )
			ui.$scenes[ names[ i ] ].show();
		else
			ui.$scenes[ names[ i ] ].hide();
	}
}

ui.handleInput = function( channel, msg ) {
	if( msg[0] == '/' ) {
		ui.handleSlashCommand( channel, msg.slice(1));
	}
	else {
		if( settings.color_code ) {
			msg = '`' + settings.color_code + msg + '`';
		}

		app.sendMessage( channel.id, msg );
	}
}

ui.handleSlashCommand = function( channel, str ) {
	var components = str.split(' ');
	var command = components.shift();

	if ( ui.slash_commands[ command ] ) {
		return ui.slash_commands[ command ].apply( channel.messages, components );
	}
	else {
		channel.messages.write('Invalid slash command "' + command + '". See /help for a list of commands.')
	}

	channel.messages.scrollToBottom();
}
