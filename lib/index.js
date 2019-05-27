#!/bin/env node

var util = require('util');
var path = require('path');
var events = require('eventemitter2');
var EventEmitter = events.EventEmitter2;
var Validator = require('jsonschema').Validator;
var v = new Validator();
var djs = require('discord.js');
var requireAll = require('require-all');
var fs = require('fs');

var optionsSchema = {
  id: "/optionsSchema",
  type: "object",
  properties: {
    plugins_dir: {
      type: "string"
    },
    token: {
      type: "string"
    },
    trigger: {
      type: "string"
    },
    reactions: {
      type: "boolean"
    },
    guilds: {
      type: "boolean"
    },
    members: {
      type: "boolean"
    },
    owners: {
      type: "array",
      minItems: 1,
      uniqueItems: true,
      items: {
        type: "string",
        pattern: /[0-9]{17,19}/,
      }
    }
  },
  required: ["plugins_dir", "owners", "trigger"]
};

var instance;
/**
 * This is the Base Discord Router Object.
 * @class Discord
 */
function Discord() {
  if(arguments.callee._singletonInstance) {
    return arguments.callee._singletonInstance;
  }
  arguments.callee._singletonInstance = this;
  EventEmitter.call(this);
  this.setMaxListeners(100);
}
/**
 * This function accepts options and starts the Bot.
 * @function Start
 * @throws {Error} If there is any Errors within Options.
 * @param  {object} options [description]
 */
Discord.prototype.Start = function(options) {
    if (options) instance.options = options;
    if ('SHARD_ID' in process.env) {
      instance.bot = new djs.Client();
    } else {
      optionsSchema.required.push(("token"));
      let chk = v.validate(options, optionsSchema);
      if (chk.errors.length > 0) {
        return console.log(new Error(util.inspect(chk.errors, false, null, true)));
      }
      instance.bot = new djs.Client({
        respawn: true
      });
    }
    instance.ReloadPlugins().then(() => {
      instance.BotHandler();
      instance.ChatHandler();
      if (instance.options.reactions) instance.monitorReactions();
      if (instance.options.members) instance.monitorMembers();
      if (instance.options.guilds) instance.monitorGuilds();
      instance.Login();
    });
};
/**
 * This function setups the Base Ready/Disconnect Events up with the Relay.
 * @function BotHandler
 * @fires Discord#ready
 * @fires Discord#disconnected
 */
Discord.prototype.BotHandler = function() {
  /**
   * Sends Ready out to the Plugins. When the Bot is online!
   * @event Discord#ready
   */
  instance.bot.on('ready', instance.EventEmit);
  /**
   * Sends Disconnected out to the Plugins. When the bot is offline!
   * @event Discord#disconnected
   */
  instance.bot.on('disconnected', function() {
    instance.EmitEvent('disconnected');
    instance.Login();
  });
};
/**
 * This is the Chat Handler System to check if the Message's Content is Valid to send off to the Plugins.
 * @fires Discord#cmd
 */
Discord.prototype.ChatHandler = function() {
  instance.bot.on('message', function(message) {
    if (message.author.id == instance.bot.user.id) return;
    if (message.author.bot) return;
    if (message.content.length < instance.options.trigger.length) return;
    if (!message.content.startsWith(instance.options.trigger)) return;
    var args = message.content.split(/ +/);
    let cmd = args[0].slice(instance.options.trigger.length).toLowerCase();
    /**
     * Event for the Triggering of a Command utilizing the Trigger String from Options.
     * @event Discord#cmd
     * @property {string} cmd  - Is the Command without the Trigger String from Options.
     * @property {array} args - Array of Strings from the Message's Content.
     * @property {object} message - Contains the Discord.js Message Object to reply, etc.
     */
    instance.EmitEvent('cmd', cmd, args, message);
  });
};

/**
 * This is to Handle Events Emitted from a Event Directly, using EventEmitter2. Transfering them to the Base `Instance` of the Object.
 * @function EventEmit
 * @event Discord#*
 * @property {dynamic} * - Allows for accepting any Event & Amount of Arguments needed, and relay them to the main Instance of the Object.
 */
Discord.prototype.EventEmit = function() {
  var args = [this.event];
  args = args.concat(Array.from(arguments));
  instance.emit.apply(instance, args);
};
/**
 * This allows for sending Direct Events to the Instance of the Object.
 * @function EmitEvent
 * @event Discord#*
 * @param  {string} event - The name of the Event to Send to the Object.
 * @return {dynamic}   *  - Dyanmic amount of Arguments.
 */
Discord.prototype.EmitEvent = function(event) {
  instance.emit.apply(instance, Array.from(arguments));
};
/**
 * Toggles on the Monitoring of Reactions on Messages for Plugins.
 * @function monitorReactions
 * @fires Discord#messageReactionAdd
 * @fires Discord#messageReactionRemove
 */
Discord.prototype.monitorReactions = function() {
  /**
   * Handles the Events for Message Reactions from Discord.js
   * @event Discord#messageReactionAdd
   * @property {object} reaction - Information for the Reaction placed on a Message.
   * @property {object} user - Information for the User who did the Reaction.
   */
  instance.bot.on('messageReactionAdd', instance.EventEmit);
  /**
   * Handles the Events for Message Reactions from Discord.js
   * @event Discord#messageReactionRemove
   * @property {object} reaction - Information for the Reaction placed on a Message.
   * @property {object} user - Information for the User who did the Reaction.
   */
  instance.bot.on('messageReactionRemove', instance.EventEmit);
};
/**
 * Toggles on the Monitoring of Members Join/Part on a Server for Plugins.
 * @function monitorMembers
 * @fires Discord#guildMemberAdd
 * @fires Discord#guildMemberRemove
 */
Discord.prototype.monitorMembers = function() {
  /**
   * Handles the Events for Guild Members Join/Part the Server from Discord.js
   * @event Discord#guildMemberRemove
   * @property {object} member - Information for the Member who Left the Server.
   */
  instance.bot.on('guildMemberRemove', instance.EventEmit);
  /**
   * Handles the Events for Guild Members Join/Part the Server from Discord.js
   * @event Discord#guildMemberAdd
   * @property {object} member - Information for the Member who Joined the Server.
   */
  instance.bot.on('guildMemberAdd', instance.EventEmit);
};
/**
 * Toggles on the Monitoring of Bot joining/parting Servers for Plugins.
 * @function monitorGuilds
 * @fires Discord#guildCreate
 * @fires Discord#guildDelete
 */
Discord.prototype.monitorGuilds = function() {
  /**
   * Handles the Events for Joining a Server from Discord.js
   * @event Discord#guildCreate
   * @property {object} guild - Information for the Guild that the Bot Joined.
   */
  instance.bot.on('guildCreate', instance.EventEmit);
  /**
   * Handles the Events for Parting a Server from Discord.js
   * @event Discord#guildDelete
   * @property {object} guild - Information for the Guild that the Bot Left.
   */
  instance.bot.on('guildDelete', instance.EventEmit);
};
/**
 * This is to Set the Bot's Activity in Discord.js
 * @function setActivity
 * @param  {string} title - Title in which to Set the Activity of.
 * @param  {string} type  - Type of Activity
 */
Discord.prototype.setActivity = function(title, type) {
  instance.bot.user.setActivity(title, type).catch(function(err) {
    console.log(err);
  });
};
/**
 * Restarts the Bot if the Bot is currently Connected, or Simply Logs the Bot back-in.
 * @function Restart
 */
Discord.prototype.Restart = function() {
  if (instance.bot.status == 0) {
    instance.bot.destroy().then(() => {
      instance.Login();
    });
  } else {
    instance.Login();
  }
};
/**
 * Reloads all the Plugins associated to the Bot.
 * @function ReloadPlugins
 */
Discord.prototype.ReloadPlugins = function() {
  return new Promise((res, rej) => {
    fs.access(path.join(require.main.paths[0], "..", instance.options.plugins_dir), function(err) {
      if (err && err.code === 'ENOENT') {
        return console.log(new Error(`Folder ${require.main.paths[0]}/${instance.options.plugins_dir} does not exist. Please Create it.`));
      } else {
        instance.plugins = requireAll({
          dirname: path.join(require.main.paths[0], "..", instance.options.plugins_dir)
        });
        res();
      }
    });
  });
};
/**
 * Logs the Bot in.
 * @function Login
 */
Discord.prototype.Login = function() {
  if ('SHARD_ID' in process.env) {
    instance.bot.login();
  } else {
    instance.bot.login(instance.options.token);
  }
}

util.inherits(Discord, EventEmitter);



module.exports = function() {
  return instance || (instance = new Discord());
}();
