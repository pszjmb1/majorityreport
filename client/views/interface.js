var plumber, maps = {}, markers = {};

UI.registerHelper('printObject', function(obj) {
    return JSON.stringify(obj);
});

Template.freeform.created = function () {
    Session.set('renderedEntities', []);

    jsPlumb.ready(function() {
        plumber = jsPlumb.getInstance({
            Anchor: 'Continuous',
            DragOptions : { cursor: "crosshair" },
            PaintStyle : {
                lineWidth:13,
                strokeStyle: '#ac8'
            },
            EndpointStyles : [{ fillStyle:"#ac8" }, { fillStyle:"#ac8" }]
        });
    }); 
};

Template.freeform.rendered = function () {
    var _self = this,
        board = this.$('#board');

    board.bind('entityAttributeChange', function() {
        plumber.repaintEverything();
    });

    // draw connections
    var relationsQuery = Provenance.find({ provType: 'MR: Relation', wasInvalidatedBy: { $exists: false} });
    relationsQuery.observe({ 
        added: function(doc) {
            var connection = plumber.getConnections(doc.mrOrigin);
            if(connection.length > 0) {
                connection = connection[0];
            } else {
                connection = drawRelation(doc);
            }

            if(connection) {
                if(!_.isEmpty(doc.mrAttribute)) {
                    var label = _.pairs(doc.mrAttribute)[0].join(": ");
                    connection.setLabel(label);
                }
            }
        }
    });

    function drawRelation(relation) {
        var sourceElem = document.getElementById(relation.mrSource),
            targetElem = document.getElementById(relation.mrTarget);

        if(sourceElem && targetElem) {
            var connection = plumber.connect({
                scope: relation.mrOrigin,
                source: sourceElem,
                target: targetElem,
                overlays: [ "Arrow" ]
            });

            connection.bind('click', function(conn, e) {
                var dialog,
                    existingElem = document.getElementById(relation.mrOrigin+"-form-attr");

                // Add focus to the existing dialog
                if(existingElem) {
                    dialog = $(existingElem).closest('.ui-dialog')[0];
                    $(dialog).effect('shake', {distance: 4, times: 2});

                    return;
                } 

                // Create a new dialog if doesnt exist already
                dialog = document.createElement('div');
                UI.insert( UI.renderWithData(Template.formAttribute, relation), dialog);
                $(dialog).appendTo(board);

                $(dialog).dialog({
                    autoOpen: true,
                    close: function(e, ui) {
                        $(this).remove();
                    }
                });
            });

            return connection;
        }
    }

};

Template.freeform.destroyed = function () {
    plumber.detachEveryConnection();
};


Template.freeform.helpers({
    entityWithAttributes: function() {
        var info = {
            attributes: getLatestRevision(this.mrAttribute),
            entity: getLatestRevision(this.mrEntity),
        };

        if(info.attributes && info.entity) {return info; }
    }
});

/**  Render entities - media, maps */
Template.entity.rendered = function () {
    var _self = this,
        outerWrapper = _self.$('.entity-outer'),
        innerWrapper = _self.$('.entity-inner'),
        connector = _self.$('.connector'); 

    Meteor.defer(function() {
        var renderedList = Session.get('renderedEntities');
        renderedList.push(_self.data.entity.mrOrigin);
        Session.set('renderedEntities', renderedList);
    });  

    // Attach plugins - draggable, resizable, jsPlumbs
    var target = plumber.makeTarget(outerWrapper);
    var source = plumber.makeSource(connector, {parent: 'parent'});

    innerWrapper.resizable({ 
        ghost: true,
        handles: "all",
        stop: updateEntityAttributes 
    });
    
    plumber.draggable(outerWrapper, { stop: updateEntityAttributes });

    target.bind('beforeDrop', addRelation);

    function updateEntityAttributes(e, ui) {
        var provAttributes = {
            mrEntity: _self.data.entity.mrOrigin,
            currentAttributeOrigin: _self.data.attributes.mrOrigin,
            mrAttribute: {
                width: innerWrapper.css('width'),
                height: innerWrapper.css('height'),
                top: outerWrapper.css('top'),
                left: outerWrapper.css('left')
            }
        };

        Meteor.call('entityReportAttributeRevision', provAttributes, function(error, result) {
            if(error) 
                return alert(error.reason);
        });
    }
};

Template.entity.helpers({
    entityType: function () {
        if(this.entity) {
            var type = this.entity.mrCollectionType || this.entity.provType.replace('MR: ', '');
            if(type) { return type.toLowerCase(); }
        }
    },
    entityAttributes: function(type) {
        if(!this.attributes || _.isEmpty(this.attributes.mrAttribute)) {
            return;
        }
        // Publish message to notify change in entity attirbute
        $('#board').trigger('entityAttributeChange');

        var keys = ['width', 'height'],
            outerOffset = { width: 10, height: 55 };        
        if(type === 'outer') { keys = keys.concat(['top', 'left', 'z-index']); }

        // Convert key/vals to styles 
        var attrs = _.map(_.pick(this.attributes.mrAttribute, keys), function(value, key) {
            if(type === 'outer' && outerOffset[key] !== undefined) {
                value = parseInt(value, 10) + outerOffset[key];
            }

            var attr = key +":"+ value +';';
            return attr;
        });

        
        
        return attrs.join(' ');
    }
});

/**
 * Forms
 */

Template.formAttribute.helpers({
    label: function () {
        if(this && !_.isEmpty(this.mrAttribute)) {
            return _.keys(this.mrAttribute)[0];
        } 
        return "Label";
    },
    value: function () {
        if(this && !_.isEmpty(this.mrAttribute)) {
            return _.values(this.mrAttribute)[0];
        } 
        return "Value";
    }
});

Template.formAttribute.events({
    'submit form': function (e, tpl) {
        e.preventDefault();
        var label = tpl.$('input[name=attribute-label]').val(),
            value = tpl.$('input[name=attribute-value]').val();

        var provAttributes = {
            currentRelationOrigin: this.mrOrigin,
            attributeKey: label.toLowerCase(),
            attributeValue: value
        };

        Meteor.call('relationRevisionAttribute', provAttributes, function (error, result) {
            if(error)
                return alert(error.reason);
        });
    }
});

/**  Tools */
Template.tools.events({
    'submit form[name=media]': function (e, tpl) {
        e.preventDefault();
        var mediaUrl = $(e.target).find('input[name=mediaUrl]').val(),
                mediaFormat = $(e.target).find('select[name=mediaFormat]').val();

        // Insert appropriate provenances for the entity and the activity: revision, entity, membership
        var provAttributes = {
            currentCrisisId: this._id,
            currentCrisisOrigin: this.mrOrigin,
            provAtLocation: mediaUrl,
            dctermsTitle: this.dctermsTitle,
            dctermsDescription: this.dctermsDescription,
            dctermsFormat: mediaFormat // Mime type
        };

        Meteor.call('crisisReportMedia', provAttributes, function(error, id) {
            if (error)
                return alert(error.reason);
        });
    }, 
    'click .entity-map': function(e, tpl) {
        e.preventDefault();

        var provAttributes = {
            currentCrisisId: this._id,
            currentCrisisOrigin: this.mrOrigin,
            dctermsTitle: this.dctermsTitle,
            dctermsDescription: this.dctermsDescription
        };

        Meteor.call('crisisReportMap', provAttributes, function (error, result) {
            if(error)
                return alert(error.reason);
        });

    }
});



/**
 * HELPERS/ COMMON METHODS 
 */
function addRelation(info) {
    var provAttributes = {
        // Gather source id, in case of markers look to the "data-id" attribute
        source: $(info.source).attr('data-id') || info.sourceId,
        target: info.targetId
    };

    Meteor.call('entityRelation', provAttributes, function (error, result) {
        if(error)
            return alert(error.reason);
    });
}

function getOffsetRect(elem) {
    // Solution from http://javascript.info/tutorial/coordinates
    // (1)
    var box = elem.getBoundingClientRect();
    
    var body = document.body;
    var docElem = document.documentElement;
    
    // (2)
    var scrollTop = window.pageYOffset || docElem.scrollTop || body.scrollTop;
    var scrollLeft = window.pageXOffset || docElem.scrollLeft || body.scrollLeft;
    
    // (3)
    var clientTop = docElem.clientTop || body.clientTop || 0;
    var clientLeft = docElem.clientLeft || body.clientLeft || 0;
    
    // (4)
    var top  = box.top +  scrollTop - clientTop;
    var left = box.left + scrollLeft - clientLeft;
    
    return { top: Math.round(top), left: Math.round(left) };
}
