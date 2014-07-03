var attachHandlers = function(a, b) {
	$(a).resizable();
	$(b).draggable({ stack: '#stage div' });
}

Template.stage.rendered = function () {
	attachHandlers('.resizable', '#stage div');
};

Template.entities.events({
	'submit form[name=media]': function (e, tpl) {
		e.preventDefault();
		var mediaUrl = $(e.target).find('input[name=mediaUrl]').val(),
				mediaFormat = $(e.target).find('select[name=mediaFormat]').val() ;

		// Insert the new element to the stage //////////////////////////////////
		var wrapper = document.createElement('div'),
				//TODO: decide which element to create based on media type
				mediaElem = document.createElement('img'); 

		$('#stage').append(
			$(wrapper)
				.attr('class', 'draggable')
				.html($(mediaElem).attr('src', mediaUrl))
		);
		attachHandlers(mediaElem, wrapper);

		// TODO: Create a new Revision

		// Insert appropriate provenance for the entity and the activity
		var media = {
			currentCrisisId: this._id,
			mrMediaUrl: mediaUrl,
			dctermsFormat: mediaFormat // Mime type
		}
		Meteor.call('newMedia', media, function(error, id) {
	    if (error)
        return alert(error.reason);  

      var membership = {
      	currentCrisisId: this._id,
      	mediaId: id
      }

      Meteor.call('collectionReportMedia', membership, function (error, result) {
				if (error)
        	return alert(error.reason);        	
      });
	  });

	}
});