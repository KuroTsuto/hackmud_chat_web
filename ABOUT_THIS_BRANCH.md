Large refactor introducing a rough MVC/MVVM-ish pattern. A quick breakdown of how this PR interprets the responsibilities of the major files:

  - `chats.js` - API data source
  - `app-data.js` - "models" - represent application state (and provide app-relevant data-source interfaces) and expose functionality to manipulate it
  - `app.js` - "controller" - centralizes business logic affecting state, and aggregates models to represent and manage state. Dispatches events describing state changes
  - `ui-data.js` - "view-models" - static view logic and view state containers
  - `ui.js` - houses active view state and interfaces it with the controller by subscribing to state change events and calling controller methods

Many of the new objects in `app-data.js` abstract the core API data-types from `chats.js` in order to add application-specific state to them. "send" and "tell" behaviors have been encapsulated in the `PrivateChannel` and `PublicChannel` objects, which both inherit from a base `ChatChannel` `Channel`-wrapper; their shared interface lets the application to handle both interchangeably (outside of parsing polled message data). Chat channels are now internally identified by an incremented ID rather than name in order to prevent possible tell/chat name collisions.

The view is insulated from application state by an event system implemented by the controller. When state changes, the controller dispatches an event with a minimal payload describing the change, to which the view can subscribe to and react accordingly. I chose an event system here because it lends itself well to cyclical/repeating logic. The event system is "promisified" in such a way that business logic can be deferred until after all event handlers have returned, which comes in handy when you want to ensure that the UI receives events in the correct order (e.g. waiting for the UI to build an interface for a new user before telling it to add user channels). This is accomplished by `.then()`-chaining the deferred logic to the end of the `{controller}.emit()` event trigger.

I've broken up the view logic into smaller components based on it's responsibility, and encapsulated them and the `MessageList` in a closure within `ui-data.js` to pull them out of the global scope (at the time, my motivation was a name collision between a `MessageList` view component and a `MessageList` data model - the latter of which has since been removed). I briefly traveled down the route of creating a whole collection of inheritance-based view components - but when I took a breather I realized my approach was somewhat overzealous and premature. If the UI does become sufficiently complex down the road I think it would be beneficial to structure it with a UI library - be it Vue or React or jQuery UI or something else - instead of building out a full component framework by hand. More realistically in the short-term, it may become desirable to further decouple view logic from the controller, in which case I think it would make sense for the UI to implement it's own EventEmitter to dispatch events on user interactions which the controller can subscribe to - this would eliminate all external calls to controller methods, enough so that the entire controller could be wrapped up into a private closure exposing only the `.on()` and `.off()` methods.

In general, I've taken my best shot at an initial separation of business and view logic. But I'm somewhat unsure where a few things belong - namely splitting up mentions, and handling slash commands. These - as well as the configuration settings in `settings.js` - seem to be almost entirely view-related, but might belong in the application controller/models. Probably more a question of semantics, and how much work the view should shoulder.

Miscellaneous Notes & Changes:
 - Includes #65 & #66 logic
 - Closes #29 and #33 (fixes #59 regression)
 - Temporary fix for #37 until we have a more unified error/notification system
 - Provides all of the business logic for #19 - just missing the button
 - Some `chats.js` functions returning promises have been modified to reject if `!res.ok` instead of resolving
 - `Account.poll()` now accepts an array of usernames, and will poll just those users, if provided - otherwise will poll all users
 - Controller polling is limited by a `max_concurrent_polls` option, which cancels a poll if there are already `x` pending. This helps to prevent duplicate polls and potentially performance intensive onslaughts if a poll is taking a while to complete the request/parsing.
 - Poll data parsing has been made asynchronous to better incorporate the event system. This happens in two passes over the data - the first maps swaps out message channel names with controller IDs and creates the channels if they're missing, the second pass adds the messages.
 - Slash commands organized into an object mapping command names to individual handler functions. Remaining "components" are `.applied()` to positional arguments when the handler is called.
 - Channels created optimistically for unknown recipients of `/tell`s will self-destruct on network errors/server rejecting the tell. The error message is directed to the channel in which the user originally issued the `/tell`.
