/**
 * Mini map - jquery plugin
 * Based on the work by Nathaniel Taintor and Brian Wald for Janrain
 * (https://github.com/goldenapples/jquery.minimap)
 */

YoMiniMap = MiniMap;
function MiniMap() {
	this.containerId = 'crisis-workspace';
	this.miniMapWrapperId = 'mini-map-wrapper';
	this.miniMapWrapperInnerClass = 'mini-map-wrapper-inner';
	
	this.viewAreaClass = 'view-area';
	this.width = 200;
	this.height = 200;

	this.initialised = false;

	this.mapWrapper = this.mapWrapperInner = this.container = this.mapBox = this.viewArea = null;

	this.filterNodesBy = {
		tags: ['div'],
		classes: ['entity-outer', 'entity-inner'],
		attributes: ['style']
	};

	return this;
}

MiniMap.prototype.init = function() {
	if(this.initialised) return; 

	var self = this;

	self.container = document.getElementById(self.containerId);
	self.mapWrapper = document.getElementById(self.miniMapWrapperId);

	self.viewArea = document.createElement('div');
	self.viewArea.className = self.viewAreaClass;


	self.mapWrapper.style.width = self.width +'px';
	self.mapWrapper.style.height = self.height +'px';
	self.mapWrapper.appendChild(self.viewArea);

	self.mapWrapperInner = document.createElement('div');
	self.mapWrapperInner.className = self.miniMapWrapperInnerClass;
	self.mapWrapper.appendChild(self.mapWrapperInner);

	self.initialised = true;

};

MiniMap.prototype.drawMap = function() {
	this.init();

	var self = this,
		containerRect = self.container.getBoundingClientRect(),
		mapWrapperRect = self.mapWrapper.getBoundingClientRect(),
		scale = Math.min(
				(mapWrapperRect.width / containerRect.width),
				(mapWrapperRect.height / containerRect.height)
			);

	if(self.mapBox !== null) { self.mapWrapperInner.removeChild(self.mapBox); }

	self.mapBox = self.container.cloneNode(true);
	var processed = _processNodes(self.mapBox, self.filterNodesBy),
		mapPostion = {};

	mapPostion.top = (processed.minimum.top < 0) ? Math.abs(processed.minimum.top) * scale : 0;
	mapPostion.left = (processed.minimum.left < 0) ? Math.abs(processed.minimum.left) * scale: 0;

	self.mapbox = processed.nodes;

	self.mapBox.style.cssText = '';
	$(self.mapBox).css({
		width: 					containerRect.width +'px',
		position:               'absolute',
      	top:                    mapPostion.top,
      	left:                   mapPostion.left,
		'transform': 			'scale('+scale+')',
		'transform-origin': 	'top left',
	});
	self.mapWrapperInner.appendChild(self.mapBox);
};

//** returns the minimum top and left positions (useful when -ve values)
var _processNodes = function(nodes, filters) {
	if(!nodes.childNodes || nodes.childNodes.length < 1) return;

	filters.tags = filters.tags || [];
	filters.classes = filters.classes || [];
	filters.attributes = filters.attributes || [];

	var filterSelectors = '', minimum = {top: 0, left: 0};

	// Prepare the selectors based on value from 
	if(filters.tags.length > 0) { filterSelectors += filters.tags.join(','); }
	if(filters.classes.length > 0) { filterSelectors += ',.'+ filters.classes.join(',.')}

	if(filters.attributes.length > 0) {
		$(nodes).find(filterSelectors).each(function(){
		  	var attributes = this.attributes,
		  		i = attributes.length;

		  	// Remove the attributes using the whitelist
			while( i-- ){
				if(!$.inArray(attributes[i], filters.attributes)) {
				  	this.removeAttributeNode(attributes[i]);
				}
			}
			
			if(this.style.top) { 
				var topValue = parseFloat(this.style.top);
				minimum.top = (topValue < minimum.top ) ? topValue : minimum.top;
			}
			if(this.style.left) { 
				var leftValue = parseFloat(this.style.left);
				minimum.left = (leftValue < minimum.left ) ? leftValue : minimum.left;
			}

		});
	}

	return { nodes: nodes, minimum: minimum};
}

