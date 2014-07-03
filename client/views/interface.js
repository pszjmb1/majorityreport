var attachHandlers = function(a, b) {
	$(a).resizable();
	$(b).draggable({ stack: '#stage div' });
}

Template.freeform.created = function () {
};

Template.freeform.rendered = function () {
	// Load the related media items
	var reportId = this.data.mrOriginProv;

	var revisionIds = [];
	var revisions = Provenance.find( 
    { provType: 'Collection', cldtermsItemType: 'Crisis Report', mrOriginProv: reportId }, 
    { sort: { provGeneratedAtTime: -1 } } 
  ).fetch().forEach(function (item) {
  	revisionIds.push(item._id);
  });

	var mediaMetas = Provenance.find({ "provHadMember.provCollection": {$in: revisionIds} }).fetch();
	var mediaIds = [];

	mediaMetas.forEach(function (item) { mediaIds.push(item.provHadMember.provEntity); });
	var mediaItems = Provenance.find({ _id: {$in: mediaIds} }).fetch();

	console.log("mesd", mediaItems)

	mediaItems.forEach(function (medium) {
	insertMediaDOM(medium.provAtLocation, false)	;
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