/**
 * Majority Report crises helpers
 */

Template.crises.helpers({
  crises: function() { 
    return Provenance.find( {provType:'Crisis Report'} );
  }
});