var getReportMedia = function(reportId) {
	// Watch for any new revision and get the latest related media
  Deps.autorun(function () {
  	// Get all the media related to this report across all revisions
  	var changed = Session.get(reportId),
  			revisionIds = getRevisions(reportId).map(function(revision){ return revision._id; }),
	  		revisionAndMedia = Provenance.find({'provHadMember.provCollection': {$in: revisionIds} }).fetch(),
	      mediaIds = _(revisionAndMedia).map(function(prov){ return prov.provHadMember.provEntity; });
	  		media = Provenance.find({_id: {$in: mediaIds} }).fetch();

	  Session.set('reportMedia', media);
  });
}

Template.freeform.created = function () {
	// Attempt to get the data as soon as the template is created
	// getReportMedia(this.data.mrOriginProv);
};

Template.freeform.rendered = function () {
	// // Watch for any new media change and render it accordingly
	// Deps.autorun(function () {
	// 	var media = Session.get('reportMedia');
	// 	var stage = d3.selectAll('#stage').selectAll('div')
	// 		.data(media);

	// 	var divs = stage.enter().append('xhtml:div')
	// 		.classed('draggable', true);

	// 	var media = divs.append('xhtml:img')
	// 		.classed('resizable', true)
	// 		.attr({
	// 			src: function(d){ return d.provAtLocation; }
	// 		});

	// 	$('div.draggable').draggable();
	// });
	
};

Template.entities.events({
	'submit form[name=media]': function (e, tpl) {
		e.preventDefault();
		var mediaUrl = $(e.target).find('input[name=mediaUrl]').val(),
				mediaFormat = $(e.target).find('select[name=mediaFormat]').val();

		// Insert appropriate provenances for the entity and the activity: revision, entity, membership
		var provAttributes = {
			currentCrisisId: this._id,
			mediaUrl: mediaUrl,
			dctermsTitle: this.dctermsTitle,
			dctermsDescription: this.dctermsDescription,
			dctermsFormat: mediaFormat // Mime type
		};

		var reportId = this.mrOriginProv;
		Meteor.call('crisisReportMedia', provAttributes, function(error, id) {
	    if (error)
      	return alert(error.reason);

      Router.go('crisisContainer', {_id: reportId});
	  });

	}
});

Template.media.rendered = function () {
	$('.draggable').draggable();
};

Template.media.helpers({
	typeImage: function () {
		// check if the media is image
		return true;
	},
	medium: function() {
		return Provenance.findOne(this.mrMedia);
	}
});