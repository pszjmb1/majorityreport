/**
 * Majority Report crises helpers
 */

/**
 * Crises helpers
 */
Template.crises.helpers({
  crises: function() { 
    return Provenance.find( {provType:'Crisis Report'}, {sort: {provGeneratedAtTime: -1}} );
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