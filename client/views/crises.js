/**
 * Majority Report crises helpers
 */

/**
 * Crises helpers
 */

Template.crises.helpers({
  crises: function() { 
    var set = Provenance.find({provType: 'Crisis Report'}).fetch();
    var list = _.groupBy(set, function(c){return c.provId});
    var output = _.map(list, function(c){ return _.max(c, function(prov){ return prov.provGeneratedAtTime; }); });
    return output;
  } 
});

/**
 * New Crisis helpers
 */
 Template.newCrisis.events({
  'submit form': function(e) {
    e.preventDefault();

    var now = new Date().getTime();

    var crisis = {
      dctermsTitle: $(e.target).find('[name=dctermsTitle]').val(),
      dctermsDescription: $(e.target).find('[name=dctermsDescription]').val()
    }

    crisis._id = Meteor.call('crisisReport', crisis, function(error, id) {
      if (error)
        return alert(error.reason);
      
      Router.go('crisisContainer', {_id: id});
    });
  }
});

/**
 * Edit Crisis helpers
 */
Template.editCrisis.events({
  'submit form': function(e) {
    e.preventDefault();

    if (confirm("Edit this crisis report?")) {
      var crisis = {
        currentCrisisId: this._id,
        dctermsTitle: $(e.target).find('[name=dctermsTitle]').val(),
        dctermsDescription: 
                $(e.target).find('[name=dctermsDescription]').val(),
        reason: $(e.target).find('[name=reason]').val()
      }

      Meteor.call('crisisReportRevision', crisis, function(error, id) {
        if (error){
          return alert(error.reason);
        }
      });
      Router.go('crises');
    }
  },

  'click .delete': function(e) {
    e.preventDefault();

    if (confirm("Remove this crisis report?")) {
      var crisis = {
        currentCrisisId: this._id
      }
      Meteor.call('crisisReportInvalidation', crisis, function(error, id) {
        if (error){
          return alert(error.reason);
        }
      });
      Router.go('crises');
    }
  } 
});

/**
 * crisisHeading helpers
 */
Template.crisisHeading.helpers({
  activityId: function() { 
    currentCrisisId = this._id;
    var activity = Provenance.findOne({provGenerated:currentCrisisId})
    if(activity){
      return activity._id;
    }
    //Provenance.findOne({provGenerated:currentCrisisId}).provWasStartedBy;
  },  
  agentId: function() { 
    currentCrisisId = this._id;
    var activity = Provenance.findOne({provGenerated:currentCrisisId})
    if(activity){
      return activity.provWasStartedBy;
    }
  },  
  agentName: function() { 
    // TODO: Following doesn't work for Revisions
    currentCrisisId = this._id;
    var activity = Provenance.findOne({provGenerated:currentCrisisId})
    if(activity){
      var agent = Provenance.findOne(activity.provWasStartedBy);
      if(agent){
        if( agent.foafGivenName){
          return agent.foafGivenName + " " +  agent.foafFamilyName;
        }else{
          return agent.mrUserName;
        }
      }
    }
  },
  owner: function() { 
    currentCrisisId = this._id;
    var activity = Provenance.findOne({provGenerated:currentCrisisId})
    if(activity){
      var agent = Provenance.findOne(activity.provWasStartedBy);
      if(agent){
        return agent.mrUserId == Meteor.userId();
      }
    }
  }
});