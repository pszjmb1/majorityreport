var attachHandlers = function(a, b) {
	$(a).resizable();
	$(b).draggable({ stack: '#stage div' });
}

var getReportMedia = function(reportId) {
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
	getReportMedia(this.data.mrOriginProv);
};

Template.freeform.rendered = function () {
	Deps.autorun(function () {
		var media = Session.get('reportMedia');

		media.forEach(function (medium) {
			insertMediaDOM(medium.provAtLocation, false);
		});
	});

	attachHandlers('.resizable', '#stage div');
};

Template.entities.events({
	'submit form[name=media]': function (e, tpl) {
		e.preventDefault();
		var mediaUrl = $(e.target).find('input[name=mediaUrl]').val(),
				mediaFormat = $(e.target).find('select[name=mediaFormat]').val() ;

		// Insert Media to the DOM
		insertMediaDOM(mediaUrl, true);

		// Insert appropriate provenances for the entity and the activity: revision, entity, membership
		var provAttributes = {
			currentCrisisId: this._id,
			mediaUrl: mediaUrl,
			dctermsTitle: this.dctermsTitle,
			dctermsDescription: this.dctermsDescription,
			dctermsFormat: mediaFormat // Mime type
		}

		var reportId = this.mrOriginProv;
		Meteor.call('crisisReportMedia', provAttributes, function(error, id) {
	    if (error)
      	return alert(error.reason);

      Router.go('crisisContainer', {_id: reportId});

	  });

	}
});

function insertMediaDOM(url, attachHandler) {
	// Insert the new element to the stage //////////////////////////////////
	// TODO: decide which element to create based on media type
	var wrapper = document.createElement('div'),
		mediaElem = document.createElement('img'); 
		
	$('#stage').append(
		$(wrapper)
			.attr('class', 'draggable')
			.html($(mediaElem).attr({
				'src': url,
				'class': 'resizable'
			}))
	);

	if(attachHandler) {
		attachHandlers(mediaElem, wrapper);	
	}
}