String.prototype.capitalize = function() {
    return this.charAt(0).toUpperCase() + this.slice(1);
}

UI.registerHelper('printObject', function(obj) {
    return JSON.stringify(obj);
});

UI.registerHelper('printArray', function(arr, separator) {
    if(_.isArray(arr) && arr.length>0) {
    	separator = separator || ', ';
        return arr.join(separator);
    }
});

UI.registerHelper('prettyDate', function(date) {
    if(moment(date).isValid()) {
    	var dateWithTimeFormat = "ddd, Do MMM YYYY - HH:mm";
        return moment(date).format(dateWithTimeFormat);
    }
});


// Agents and Users
UI.registerHelper('count', function(item) {
	if(item && _.isArray(item)) {
      return item.length;
    }
});

// Agents and Users
UI.registerHelper('isOwner', function(agent) {
	if(agent) {
      return agent.mrUserId == Meteor.userId();
    }
});



UI.registerHelper('getAgentName', getAgentName);

UI.registerHelper('getAgentNameById', function(agentId) {
	var agent = Provenance.findOne({mrUserId: agentId}) || Provenance.findOne(agentId),
		name = getAgentName(agent);

	if(name) { return name; }
});

/**
 * Shared Helpers for UI.helpers
 */
function getAgentName(agent) {
	if(agent) {
		if(agent.mrUserId === Meteor.userId()) {
		  return "You";
		}else if( agent.foafGivenName){
		  return agent.foafGivenName +" "+  agent.foafFamilyName;
		}else{
		  return agent.mrUserName;
		}
	}
}


