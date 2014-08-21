String.prototype.capitalize = function() {
    return this.charAt(0).toUpperCase() + this.slice(1);
}

UI.registerHelper('printObject', function(obj) {
    return JSON.stringify(obj);
});

UI.registerHelper('prettyDate', function(date) {
    if(moment(date).isValid()) {
        return moment(date).format(dateWithTimeFormat);
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
    
    console.log('name ' , name);

	if(name) { return name; }
});

/**
 * Shared Helpers for UI.helpers
 */
function getAgentName(agent) {
	if(agent) {
		if( agent.foafGivenName){
		  return agent.foafGivenName +" "+  agent.foafFamilyName;
		}else{
		  return agent.mrUserName;
		}
	}
}


