import * as helpers from "../../../helpers/helpers";
import * as drawingHelpers from "../../../helpers/drawingHelpers";
import {LayerHelpers, FeatureHelpers, OL_DATA_TYPES} from "../../../helpers/OLHelpers";
import TOCConfig from "../common/TOCConfig.json";
import xml2js from "xml2js";

// INDEX WHERE THE TOC LAYERS SHOULD START DRAWING AT
const layerIndexStart = 100;

// LOCAL STORAGE KEY
const storageKey = "Layers";
const storageMapDefaultsKey = "Map Defaults";
const storageExtentKey = "Map Extent";

const myMapLayerName = "local:myMaps";
const excludedProps = ["_layerProperties", "rebuildParams","_layerVisible","_layerOpacity","_layerType","layerFeatures"];
const includedLayerProps = ["name", "rebuildParams","displayName","disableParcelClick","wfsUrl","rootInfoUrl","liveLayer","queryable","opaque"];


export function makeGroup(groupDisplayName, isDefault,groupUrl, groupPrefix, visibleLayers,wmsGroupUrl,customGroupUrl, layers = []){
  const groupObj = {
    value: helpers.getUID(),
    label: groupDisplayName,
    defaultGroup: isDefault,
    url: groupUrl,
    prefix:groupPrefix,
    visibleLayers: visibleLayers,
    wmsGroupUrl: wmsGroupUrl,
    customRestUrl: customGroupUrl, 
    layers:layers
  };

  return groupObj;
}

export function makeLayer( layerName, layerId = helpers.getUID(),group ,layerIndex=0, visible=false, opacity=1,layer, minScale = 0,maxScale = 100000000000,liveLayer = false,styleUrl ="",callback){
  let newLayer = layer;
  let existingLayer = drawingHelpers.getLayerByName(layerId);
  if (existingLayer !== undefined) 
  {
    newLayer = existingLayer
  }else{
    newLayer.setVisible(visible);
    newLayer.setOpacity(opacity);
    newLayer.setProperties({ name: layerId, displayName: layerName});
    newLayer.setZIndex(layerIndex);
    window.map.addLayer(newLayer);
  }
  
  const returnLayer = {
    name: layerId,
    displayName: layerName,
    styleUrl:styleUrl,
    height: 30, // HEIGHT OF DOM ROW FOR AUTOSIZER
    drawIndex: layerIndex, // INDEX USED BY VIRTUAL LIST
    index: layerIndex, // INDEX USED BY VIRTUAL LIST
    showLegend: false, // SHOW LEGEND USING PLUS-MINUS IN TOC
    legendHeight: -1, // HEIGHT OF IMAGE USED BY AUTOSIZER
    legendImage: null, // IMAGE DATA, STORED ONCE USER VIEWS LEGEND
    visible: visible, // LAYER VISIBLE IN MAP, UPDATED BY CHECKBOX
    layer: newLayer, // OL LAYER OBJECT
    metadataUrl: null, // ROOT LAYER INFO FROM GROUP END POINT
    opacity: opacity, // OPACITY OF LAYER
    minScale: minScale, //MinScaleDenominator from geoserver
    maxScale: maxScale, //MaxScaleDenominator from geoserver
    liveLayer: liveLayer, // LIVE LAYER FLAG
    groupName:group.label,
    group:group.value
  };
  callback(returnLayer);
}

// GET GROUPS FROM GET CAPABILITIES
export function getGroupsFromData(data, callback) {
  let defaultGroup = null;
  let isDefault = false;
  let groups = [];
  var items = [];
  for (var item in data) {
    if (data.hasOwnProperty(item)) {
      items.push(data[item]);
    }
  }
  items.forEach(group => {
    let layerList = [];
    const groupLayerList = group.layers;
    var layers = [];
    for (var item in groupLayerList) {
      if (groupLayerList.hasOwnProperty(item)) {
        layers.push(groupLayerList[item]);
      }
    }
    const groupLength = layers.filter(item => item.name !== myMapLayerName).length;
    let layerIndex = groupLength + layerIndexStart;
    

    const buildLayers = (layers, layerIndex) => {
      layers.forEach(currentLayer => {
        if (!isDuplicate(layerList, currentLayer.name) && currentLayer.name !== myMapLayerName) {
          jsonToLayer(currentLayer, result => {
            layerList.push(result);
          });
          layerIndex--;
        }
      });
    };
    buildLayers(layers, layerIndex);
    

    const groupObj = {
          value: group.value,
          label: group.label,
          url: group.url,
          prefix:group.prefix,
          defaultGroup: group.defaultGroup,
          visibleLayers: group.visibleLayers,
          wmsGroupUrl: group.wmsGroupUrl,
          customRestUrl: group.customRestUrl,
          layers: layerList
        };
    if (groupObj.layers.length >=1){
      groups.push(groupObj);
      if (isDefault) {
        defaultGroup = groupObj;
        isDefault = false;
      }
    }
  });
  if (defaultGroup === undefined || defaultGroup === null) defaultGroup = groups[0];
  callback([groups, defaultGroup]);
}

// GET GROUPS FROM GET CAPABILITIES
export async function getGroupsGC(url, urlType, callback) {
  let defaultGroup = null;
  let isDefault = false;
  let groups = [];
  const remove_underscore = name => {
    return helpers.replaceAllInString(name, "_", " ");
  };

  helpers.httpGetText(url, result => {
    var parser = new xml2js.Parser();

    // PARSE TO JSON
    parser.parseString(result, function(err, result) {
      let groupLayerList =
        urlType === "root"
          ? result.WMS_Capabilities.Capability[0].Layer[0].Layer
          : urlType === "group"
          ? result.WMS_Capabilities.Capability[0].Layer[0].Layer[0].Layer
          : result.WMS_Capabilities.Capability[0].Layer[0].Layer;
      let parentGroup =
        urlType === "root"
          ? result.WMS_Capabilities.Capability[0].Layer[0].Layer[0]
          : urlType === "group"
          ? result.WMS_Capabilities.Capability[0].Layer[0].Layer[0]
          : result.WMS_Capabilities.Capability[0].Layer[0].Layer[0];
      let parentKeywords = parentGroup.KeywordList;
      if (parentKeywords !== undefined) parentKeywords = parentKeywords[0].Keyword;
      let mapCenter = [];
      if (parentKeywords !== undefined && parentKeywords.length > 0) mapCenter = _getCenterCoordinates(parentKeywords);
      let mapZoom = 0;
      if (parentKeywords !== undefined && parentKeywords.length > 0) mapZoom = _getZoom(parentKeywords);
      let defaultGroupName = "";
      if (parentKeywords !== undefined && parentKeywords.length > 0) defaultGroupName = _getDefaultGroup(parentKeywords);
      if (mapCenter.length > 0 && mapZoom > 0) {
        sessionStorage.removeItem(storageMapDefaultsKey);
        sessionStorage.setItem(storageMapDefaultsKey, JSON.stringify({ center: mapCenter, zoom: mapZoom }));
        const storage = helpers.getItemsFromStorage(storageExtentKey);
        if (storage === undefined) {
          window.map.getView().animate({ center: mapCenter, zoom: mapZoom });
        }
      }
      groupLayerList.forEach(layerInfo => {
        if (layerInfo.Layer !== undefined) {
          const groupName = layerInfo.Name[0];
          if (groupName.toUpperCase() === defaultGroupName.toUpperCase()) isDefault = true;
          const groupDisplayName = layerInfo.Title[0];
          const groupUrl = url.split("/geoserver/")[0] + "/geoserver/" + helpers.replaceAllInString(groupName, ":", "/") + "/ows?service=wms&version=1.3.0&request=GetCapabilities";
          const fullGroupUrl = url.split("/geoserver/")[0] + "/geoserver/" + helpers.replaceAllInString(groupName, ":", "/") + "/ows?service=wms&version=1.3.0&request=GetCapabilities";
          let keywords = [];
          if (layerInfo.KeywordList[0] !== undefined) keywords = layerInfo.KeywordList[0].Keyword;
          let visibleLayers = [];
          let groupPrefix = "";
          if (keywords !== undefined) visibleLayers = _getVisibleLayers(keywords);
          if (keywords !== undefined) groupPrefix = _getGroupPrefix(keywords);
          let layerList = [];
          if (layerInfo.Layer !== undefined) {
            const groupLayerList = layerInfo.Layer;

            let layerIndex = groupLayerList.length + layerIndexStart;
            const tmpGroupObj = {
              value: groupName,
              label: remove_underscore(groupDisplayName),
              url: groupUrl,
              prefix:groupPrefix,
              defaultGroup: isDefault,
              visibleLayers: visibleLayers,
              wmsGroupUrl: fullGroupUrl
            };

            const buildLayers = layers => {
              layers.forEach(currentLayer => {
                if (!isDuplicate(layerList, currentLayer.Name[0])) {
                  buildLayerByGroup(tmpGroupObj, currentLayer, layerIndex, result => {
                    layerList.push(result);
                  });
                  layerIndex--;
                  if (currentLayer.Layer === undefined) {
                    visibleLayers.push(currentLayer.Name[0]);
                  } else {
                    buildLayers(currentLayer.Layer);
                  }
                }
              });
            };
            buildLayers(layerInfo.Layer);
          }

        const groupObj = {
              value: groupName,
              label: remove_underscore(groupDisplayName),
              url: groupUrl,
              prefix:groupPrefix,
              defaultGroup: isDefault,
              visibleLayers:visibleLayers,
              wmsGroupUrl: fullGroupUrl,
              layers: layerList
            };
        if (groupObj.layers.length >=1){
          groups.push(groupObj);
          if (isDefault) {
            defaultGroup = groupObj;
            isDefault = false;
          }
        }
      }});
    });
    if (defaultGroup === undefined || defaultGroup === null) defaultGroup = groups[0];
    callback([groups, defaultGroup]);
  });



}

// GET GROUPS FROM CONFIG
export function getGroups() {
  let defaultGroup = null;
  let groups = [];
  for (var i = 0, len = TOCConfig.layerGroups.length; i < len; i++) {
    const group = TOCConfig.layerGroups[i];
    const wmsGroupUrl = group.wmsUrl;
    const customGroupUrl = group.customRestUrl;
    const isDefault = group.defaultGroup;
    const groupName = group.name;
    const groupDisplayName = group.displayName;
    const groupObj = {
      value: groupName,
      label: groupDisplayName,
      defaultGroup: isDefault,
      visibleLayers: group.visibleLayers,
      wmsGroupUrl: wmsGroupUrl,
      customRestUrl: customGroupUrl
    };
    groups.push(groupObj);

    if (isDefault) defaultGroup = groupObj;
  }

  return [groups, defaultGroup];
}

// GET BASIC INFO - THIS IS FOR PERFORMANCE TO LOAD LAYERS IN THE TOC
export function getBasicLayers(group, callback) {
  if (!TOCConfig.useCustomRestUrl) {
    this.getLayerListByGroupWMS(group, layerList => {
      callback(layerList);
    });
  } else {
    this.getLayerListByGroupCustomRest(group, layerList => {
      callback(layerList);
    });
  }
}

export function getFullInfoLayers(layers, callback) {
  var newLayers = [];
  for (let index = 0; index < layers.length; index++) {
    const layer = layers[index];
    let newLayer = Object.assign({}, layer);
    getBase64FromImageUrl(layer.styleUrl, (height, img) => {
      newLayer.legendHeight = height;
      newLayer.legendImage = img;
      newLayers.push(newLayer);

      if (index === layers.length - 1) callback(newLayers);
    });
  }
}

export function getBase64FromImageUrl(url, callback) {
  var img = new Image();

  img.setAttribute("crossOrigin", "anonymous");

  img.onload = function() {
    var canvas = document.createElement("canvas");
    canvas.width = this.width;
    canvas.height = this.height;

    var ctx = canvas.getContext("2d");
    ctx.drawImage(this, 0, 0);

    var dataURL = canvas.toDataURL("image/png");

    //var data = dataURL.replace(/^data:image\/(png|jpg);base64,/, "");
    callback(this.height, dataURL);
  };

  img.src = url;
}

export function isDuplicate(layerList, newLayerName) {
  let returnValue = false;
  layerList.forEach(layer => {
    if (layer.name === newLayerName) {
      returnValue = true;
    }
  });
  return returnValue;
}
export function jsonToLayer(json, callback){
  const returnObject = {};
  for (const property in json) {
    if (!excludedProps.includes(property)) returnObject[property] = json[property];
  }
  const layerProperties = json._layerProperties;
  const rebuildParams = layerProperties.rebuildParams;
  const visible = json._layerVisible;
  const opacity = json._layerOpacity;
  const drawIndex = json.index;
  const layerFeatures = json.layerFeatures;
  const layerProps = {};
  for (const property in layerProperties) {
    if (includedLayerProps.includes(property)) layerProps[property] = layerProperties[property];
  }
  // LAYER PROPS

  LayerHelpers.getLayer(rebuildParams.sourceType,
    rebuildParams.source,
    rebuildParams.projection,
    rebuildParams.layerName,
    rebuildParams.url,
    rebuildParams.tiled,
    rebuildParams.file,
    rebuildParams.extent,
    rebuildParams.name,
    (newLayer)=>
    {
      newLayer.setVisible(visible);
      newLayer.setOpacity(opacity);
      newLayer.setProperties(layerProps);
      window.map.addLayer(newLayer);
      newLayer.setZIndex(drawIndex);
      if (rebuildParams.file === "STORED FEATURES"){
        const features = FeatureHelpers.getFeatures(layerFeatures,OL_DATA_TYPES.KML);
        newLayer.getSource().addFeatures(features);
      } 
      returnObject["layer"] = newLayer;
      callback(returnObject);
    });
}

export function layerToJson(layer, callback){
  const returnObject = {};
  for (const property in layer) {
    if (property !== 'layer'){
      returnObject[property] = layer[property];
    }
  }
  const olLayer = layer.layer;
  let layerSource = layer.layer.getSource();
  returnObject["_layerType"] = LayerHelpers.getLayerType(olLayer);
  returnObject["_layerSourceType"] = LayerHelpers.getLayerSourceType(layerSource);
  returnObject["_layerVisible"] = olLayer.getVisible();
  returnObject["_layerOpacity"] = olLayer.getOpacity();
  //returnObject["_layerProperties"] = olLayer.getProperties();
  const olLayerProperties = olLayer.getProperties();
  const returnLayerProperties = {};
  for (const property in olLayerProperties) {
    if (property !== 'source'){
      returnLayerProperties[property] = olLayerProperties[property];
    }
  }
  returnObject["_layerProperties"] = returnLayerProperties;
  const rebuildParams = returnLayerProperties.rebuildParams;
  if (rebuildParams !== undefined && rebuildParams.file === "STORED FEATURES") {
    returnObject["layerFeatures"] = FeatureHelpers.setFeatures(olLayer.getSource().getFeatures(),OL_DATA_TYPES.KML);
  }
  //savedLayers[layer.name] = saveLayer;
  if (callback !== undefined)callback(returnObject);
}

export async function buildLayerByGroup(group, layer, layerIndex, callback) {
  // SAVED DATA
  let savedData = helpers.getItemsFromStorage(storageKey);
  if (savedData === undefined) savedData = [];
  const savedLayers = savedData[group.value];

  if (layer.Layer === undefined) {
    const visibleLayers = group.visibleLayers === undefined ? [] : group.visibleLayers;

    const layerNameOnly = layer.Name[0];
    let layerTitle = layer.Title[0];
    let queryable = layer.$.queryable !== undefined?layer.$.queryable === "1":false;
    let opaque = layer.$.opaque !== undefined?layer.$.opaque === "1":false;
    if (layerTitle === undefined) layerTitle = layerNameOnly;
    const keywords = layer.KeywordList[0].Keyword;
    const styleUrl = layer.Style !== undefined ? layer.Style[0].LegendURL[0].OnlineResource[0].$["xlink:href"].replace("http", "https") : "";
    const serverUrl = group.wmsGroupUrl.split("/geoserver/")[0] + "/geoserver";
   // const wfsUrlTemplate = (serverUrl, layerName) => `${serverUrl}/wfs?service=wfs&version=2.0.0&request=GetFeature&typeNames=${layerName.split(" ").join("%20")}&outputFormat=application/json&cql_filter=`;
   // const wfsUrl = wfsUrlTemplate(serverUrl, layer.Name[0]);

    const metadataUrlTemplate = (serverUrl, layerName) => `${serverUrl}/rest/layers/${layerName.split(" ").join("%20")}.json`;
    const metadataUrl = metadataUrlTemplate(serverUrl, layer.Name[0]);

    // LIVE LAYER
    let liveLayer = _isLiveLayer(keywords);

    // DOWNLOAD
    let canDownload = _getCanDownload(keywords);

    // IDENTIFY DISPLAY NAME
    let identifyDisplayName = _getDisplayName(keywords);

    //DISPLAY NAME
    let displayName = _getDisplayName(keywords);
    if (displayName==="") displayName =layerTitle;
    
    if (group.prefix !== undefined) {
      displayName = group.prefix !== "" ? group.prefix + ' - ' + displayName : displayName;
    }
    // OPACITY
    let opacity = _getOpacity(keywords);

    //IDENTIFY 
    let identifyTitleColumn = _getIdentifyTitle(keywords);
    let identifyIdColumn = _getIdentifyId(keywords);
    //DISCLAIMER
    let disclaimerTitle = _getDisclaimerTitle(keywords);
    let disclaimerUrl = _getDisclaimerURL(keywords);
    let disclaimer = undefined;
    if (disclaimerUrl !== "" || disclaimerTitle !== ""){
      disclaimer = {title:disclaimerTitle, url:disclaimerUrl};
    }
    const minScale = layer.MinScaleDenominator;
    const maxScale = layer.MaxScaleDenominator;
    // SET VISIBILITY
    let layerVisible = false;
    if (savedLayers !== undefined) {
      const savedLayer = savedLayers[layerNameOnly];
      if (savedLayer !== undefined && savedLayer.visible) layerVisible = true;
    } else if (visibleLayers.includes(layerNameOnly)) layerVisible = true;

    // LAYER PROPS
    LayerHelpers.getLayer(OL_DATA_TYPES.ImageWMS,
                          "WMS",
                          undefined, 
                          layer.Name[0],
                          serverUrl + "/wms?layers=" + layer.Name[0],
                          false,
                          undefined,
                          undefined,
                          displayName,
                          (newLayer)=>
    {
      const wfsUrlTemplate = (rootUrl, layer) => `${rootUrl}/wfs?service=wfs&version=2.0.0&request=GetFeature&typeNames=${layer}&outputFormat=application/json&cql_filter=`;
      const wfsUrl = wfsUrlTemplate(serverUrl.replace("/wms", ""), layer.Name[0]);
    
      const workspace = layer.Name[0].split(":")[0];
      const rootInfoTemplate = (rootUrl, ws, lnOnly) => `${rootUrl}/rest/workspaces/${ws}/layers/${lnOnly}.json`;
      const rootInfoUrl = rootInfoTemplate(serverUrl.replace("/wms", ""), workspace, layerNameOnly);

      newLayer.setVisible(layerVisible);
      newLayer.setOpacity(opacity);
      newLayer.setProperties({ name: layerNameOnly, displayName: displayName,wfsUrl: wfsUrl, rootInfoUrl: rootInfoUrl, disableParcelClick: liveLayer,queryable:queryable,opaque:opaque  });

      newLayer.setZIndex(layerIndex);
      window.map.addLayer(newLayer);

      const returnLayer = {
        name: layerNameOnly, // FRIENDLY NAME
        height: 30, // HEIGHT OF DOM ROW FOR AUTOSIZER
        drawIndex: layerIndex, // INDEX USED BY VIRTUAL LIST
        index: layerIndex, // INDEX USED BY VIRTUAL LIST
        styleUrl: styleUrl, // WMS URL TO LEGEND SWATCH IMAGE
        showLegend: false, // SHOW LEGEND USING PLUS-MINUS IN TOC
        legendHeight: -1, // HEIGHT OF IMAGE USED BY AUTOSIZER
        legendImage: null, // IMAGE DATA, STORED ONCE USER VIEWS LEGEND
        visible: layerVisible, // LAYER VISIBLE IN MAP, UPDATED BY CHECKBOX
        layer: newLayer, // OL LAYER OBJECT
        metadataUrl: metadataUrl, // ROOT LAYER INFO FROM GROUP END POINT
        opacity: opacity, // OPACITY OF LAYER
        minScale: minScale, //MinScaleDenominator from geoserver
        maxScale: maxScale, //MaxScaleDenominator from geoserver
        liveLayer: liveLayer, // LIVE LAYER FLAG
        identifyDisplayName: identifyDisplayName, // DISPLAY NAME USED BY IDENTIFY
        group: group.value,
        groupName: group.label,
        canDownload: canDownload, // INDICATES WETHER LAYER CAN BE DOWNLOADED
        displayName: displayName, // DISPLAY NAME USED BY IDENTIFY
        identifyTitleColumn: identifyTitleColumn,
        identifyIdColumn: identifyIdColumn,
        disclaimer: disclaimer
      };
      callback(returnLayer);
    });
  }
}

export function getLayerListByGroupWMS(group, callback) {
  // SAVED DATA
  //const savedData = helpers.getItemsFromStorage(storageKey);
  //const savedLayers = savedData[group.value];

  // GET XML
  helpers.httpGetText(group.wmsGroupUrl, result => {
    var parser = new xml2js.Parser();

    // PARSE TO JSON
    parser.parseString(result, function(err, result) {
      const groupLayerList = result.WMS_Capabilities.Capability[0].Layer[0].Layer[0].Layer;
      //const visibleLayers = group.visibleLayers === undefined ? [] : group.visibleLayers;
      let layerIndex = groupLayerList.length + layerIndexStart;
      let layerList = [];
      groupLayerList.forEach(layerInfo => {
        if (!isDuplicate(layerList, layerInfo.Name[0])) {
          if (layerInfo.Layer === undefined) {
            buildLayerByGroup(group, layerInfo, layerIndex, result => {
              layerList.push(result);
            });
            layerIndex--;
          }
        }
      });

      callback(layerList);
    });
  });
}

export function getLayerListByGroup(group, callback) {
  // GET XML
  helpers.httpGetText(group.wmsGroupUrl, result => {
    var parser = new xml2js.Parser();

    // PARSE TO JSON
    parser.parseString(result, function(err, result) {
      const groupLayerList = result.WMS_Capabilities.Capability[0].Layer[0].Layer[0].Layer;
      const isLayer = layer => {
        return layer.Layer === undefined;
      };
      const allLayers = groupLayerList.find(isLayer);
      console.log(allLayers);
      let layerIndex = groupLayerList.length + layerIndexStart;
      let layerList = [];

      groupLayerList.forEach(layerInfo => {
        if (!isDuplicate(layerList, layerInfo.Name[0])) {
          if (layerInfo.Layer === undefined) {
            buildLayerByGroup(group, layerInfo, layerIndex, result => {
              layerList.push(result);
            });
            layerIndex--;
          }
        }
      });

      callback(layerList);
    });
  });
}

function _getDefaultGroup(keywords) {
  if (keywords === undefined) return false;
  const defaultKeyword = keywords.find(function(item) {
    return item.indexOf("DEFAULT_GROUP") !== -1;
  });
  if (defaultKeyword !== undefined) {
    const val = defaultKeyword.split("=")[1];
    return val;
  } else return "";
}

export function getLayerListByGroupCustomRest(group, callback) {
  // SAVED DATA
  let savedData = helpers.getItemsFromStorage(storageKey);
  if (savedData === undefined) savedData = [];
  const savedLayers = savedData[group.value];

  //console.log(group);
  //console.log(group.customRestUrl);
  helpers.getJSON(group.customRestUrl, layerGroupInfo => {
    //console.log(layerGroupInfo);
    let groupLayerList = null;
    if (Array.isArray(layerGroupInfo.layerGroup.publishables.published)) {
      if (layerGroupInfo.layerGroup.publishables.published.length > 0) groupLayerList = layerGroupInfo.layerGroup.publishables.published;
    } else {
      groupLayerList = [layerGroupInfo.layerGroup.publishables.published];
    }

    // RETURN IF WE DON"T HAVE ANYTHING TO PROCESS
    if (groupLayerList === null) return;

    const visibleLayers = group.visibleLayers === undefined ? [] : group.visibleLayers;
    let layerIndex = groupLayerList.length + layerIndexStart;
    let layerList = [];
    groupLayerList.forEach(layerInfo => {
      //console.log(layerInfo);
      const layerNameOnly = layerInfo.name;
      if (!isDuplicate(layerList, layerNameOnly)) {
        let layerTitle = layerInfo.layerDetails.featureType.title[0];
        if (layerTitle === undefined) layerTitle = layerNameOnly;
        const keywords = layerInfo.layerDetails.featureType.keywords[0].string;
        const serverUrl = layerInfo.href.split("/rest/")[0];
        const styleUrlTemplate = (serverUrl, layerName) => `${serverUrl}/wms?REQUEST=GetLegendGraphic&VERSION=1.0.0&FORMAT=image/png&WIDTH=20&HEIGHT=20&LAYER=${layerName.split(" ").join("%20")}`;
        const styleUrl = styleUrlTemplate(serverUrl, layerInfo.name);
        const wfsUrlTemplate = (serverUrl, layerName) => `${serverUrl}/wfs?service=wfs&version=2.0.0&request=GetFeature&typeNames=${layerName.split(" ").join("%20")}&outputFormat=application/json&cql_filter=`;
        const wfsUrl = wfsUrlTemplate(serverUrl, layerInfo.name);
        const metadataUrlTemplate = (serverUrl, layerName) => `${serverUrl}/rest/layers/${layerName.split(" ").join("%20")}.json`;
        const metadataUrl = metadataUrlTemplate(serverUrl, layerInfo.name);

        // LIVE LAYER
        let liveLayer = _isLiveLayer(keywords);

        // DOWNLOAD
        let canDownload = _getCanDownload(keywords);

        // IDENTIFY DISPLAY NAME
        let identifyDisplayName = _getDisplayName(keywords);
		let displayName = _getDisplayName(keywords);
		if (displayName==="") displayName =layerTitle;

        // OPACITY
        let opacity = _getOpacity(keywords);
        //IDENTIFY 
        let identifyTitleColumn = _getIdentifyTitle(keywords);
        let identifyIdColumn = _getIdentifyId(keywords);
        //DISCLAIMER
        let disclaimerTitle = _getDisclaimerTitle(keywords);
        let disclaimerUrl = _getDisclaimerURL(keywords);
        let disclaimer = undefined;
        if (disclaimerUrl !== "" || disclaimerTitle !==""){
          disclaimer = {title:disclaimerTitle, url:disclaimerUrl};
        }
        // SET VISIBILITY
        let layerVisible = false;
        if (savedLayers !== undefined) {
          const savedLayer = savedLayers[layerNameOnly];
          if (savedLayer !== undefined && savedLayer.visible) layerVisible = true;
        } else if (visibleLayers.includes(layerNameOnly)) layerVisible = true;

        // LAYER PROPS
        let layer = helpers.getImageWMSLayer(serverUrl + "/wms", layerInfo.name);
        layer.setVisible(layerVisible);
        layer.setOpacity(opacity);
        layer.setProperties({ name: layerNameOnly, displayName: displayName });
        layer.setZIndex(layerIndex);
        window.map.addLayer(layer);

        // LAYER OBJECT USED BY TOC
        layerList.push({
          name: layerNameOnly, // FRIENDLY NAME
          height: 30, // HEIGHT OF DOM ROW FOR AUTOSIZER
          drawIndex: layerIndex, // INDEX USED BY VIRTUAL LIST
          index: layerIndex, // INDEX USED BY VIRTUAL LIST
          styleUrl: styleUrl, // WMS URL TO LEGEND SWATCH IMAGE
          showLegend: false, // SHOW LEGEND USING PLUS-MINUS IN TOC
          legendHeight: -1, // HEIGHT OF IMAGE USED BY AUTOSIZER
          legendImage: null, // IMAGE DATA, STORED ONCE USER VIEWS LEGEND
          visible: layerVisible, // LAYER VISIBLE IN MAP, UPDATED BY CHECKBOX
          layer: layer, // OL LAYER OBJECT
          metadataUrl: metadataUrl, // ROOT LAYER INFO FROM GROUP END POINT
          opacity: opacity, // OPACITY OF LAYER
          liveLayer: liveLayer, // LIVE LAYER FLAG
          minScale: undefined, //placeholder MinScaleDenominator
          maxScale: undefined, //placeholder MaxScaleDenominator
          wfsUrl: wfsUrl,
          displayName: displayName, // DISPLAY NAME USED BY IDENTIFY
          identifyDisplayName: identifyDisplayName, // DISPLAY NAME USED BY IDENTIFY
          group: group.value,
          groupName: group.label,
          canDownload: canDownload, // INDICATES WETHER LAYER CAN BE DOWNLOADED
          identifyTitleColumn: identifyTitleColumn,
          identifyIdColumn: identifyIdColumn,
          disclaimer: disclaimer
        });

        layerIndex--;
      }
    });

    callback(layerList);
  });
}

function _isLiveLayer(keywords) {
  if (keywords === undefined) return false;
  const liveLayerKeyword = keywords.find(function(item) {
    return item.indexOf("LIVE_LAYER") !== -1;
  });
  if (liveLayerKeyword !== undefined) return true;
  else return false;
}

function _getGroupPrefix(keywords) {
  if (keywords === undefined)  return "";
  const groupPrefixKeyword = keywords.find(function(item) {
    return item.indexOf("GROUP_PREFIX") !== -1;
  });
  if (groupPrefixKeyword !== undefined) {
    const val = groupPrefixKeyword.split("=")[1];
    return val;
  } else return "";
}

function _getDisplayName(keywords) {
  if (keywords === undefined) return "";
  const displayNameKeyword = keywords.find(function(item) {
  	return item.indexOf("DISPLAY_NAME") !== -1;
    //return item.indexOf("IDENTIFY_DISPLAY_NAME") !== -1;
  });
  if (displayNameKeyword !== undefined) {
    const val = displayNameKeyword.split("=")[1];
    return val;
  } else return "";
}

function _getIdentifyTitle(keywords) {
  if (keywords === undefined)  return "";
  const identifyTitleColumn = keywords.find(function(item) {
    return item.indexOf("IDENTIFY_TITLE_COLUMN") !== -1;
  });
  if (identifyTitleColumn !== undefined) {
    const val = identifyTitleColumn.split("=")[1];
    return val;
  } else return "";
}


function _getDisclaimerURL(keywords) {
  if (keywords === undefined)  return "";
  const returnText = keywords.find(function(item) {
    return item.indexOf("DISCLAIMER_URL") !== -1;
  });
  if (returnText !== undefined) {
    const val = returnText.split("=")[1];
    return val.split("”").join("");
  } else return "";
}


function _getDisclaimerTitle(keywords) {
  if (keywords === undefined)  return "";
  const returnText = keywords.find(function(item) {
    return item.indexOf("DISCLAIMER_TITLE") !== -1;
  });
  if (returnText !== undefined) {
    const val = returnText.split("=")[1];
    return val.split("”").join("");
  } else return "";
}

function _getIdentifyId(keywords) {
  if (keywords === undefined)  return "";
  const identifyIdColumn = keywords.find(function(item) {
    return item.indexOf("IDENTIFY_ID_COLUMN") !== -1;
  });
  if (identifyIdColumn !== undefined) {
    const val = identifyIdColumn.split("=")[1];
    return val;
  } else return "";
}

function _getVisibleLayers(keywords) {
  if (keywords === undefined) return "";
  const visibleLayersKeyword = keywords.find(function(item) {
    return item.indexOf("VISIBLE_LAYERS") !== -1;
  });
  if (visibleLayersKeyword !== undefined) {
    const val = visibleLayersKeyword.split("=")[1];
    return val.split(",");
  } else return [];
}

function _getCenterCoordinates(keywords) {
  if (keywords === undefined) return "";
  const centerCoordinatesKeyword = keywords.find(function(item) {
    return item.indexOf("MAP_CENTER") !== -1;
  });
  if (centerCoordinatesKeyword !== undefined) {
    const val = centerCoordinatesKeyword.split("=")[1];
    return val.split(",");
  } else return [];
}

function _getZoom(keywords) {
  if (keywords === undefined) return 1;
  const zoomKeyword = keywords.find(function(item) {
    return item.indexOf("MAP_ZOOM") !== -1;
  });
  if (zoomKeyword !== undefined) {
    const val = zoomKeyword.split("=")[1];
    return parseInt(val);
  } else return 0;
}

function _getOpacity(keywords) {
  if (keywords === undefined) return 1;
  const opacityKeyword = keywords.find(function(item) {
    return item.indexOf("OPACITY") !== -1;
  });
  if (opacityKeyword !== undefined) {
    const val = opacityKeyword.split("=")[1];
    return parseFloat(val);
  } else return 1;
}

function _getCanDownload(keywords) {
  if (keywords === undefined) return false;
  const downloadLayerKeyword = keywords.find(function(item) {
    return item.indexOf("DOWNLOAD") !== -1;
  });
  if (downloadLayerKeyword !== undefined) return true;
  else return false;
}

export function disableLayersVisiblity(layers, callback) {
  var newLayers = [];
  for (let index = 0; index < layers.length; index++) {
    const layer = layers[index];
    layer.layer.setVisible(false);
    let newLayer = Object.assign({}, layer);
    newLayers.push(newLayer);
    if (index === layers.length - 1) callback(newLayers);
  }
}


export function acceptDisclaimer(layer, returnToFunction) {
  if (layer.disclaimer!==undefined && (window.acceptedDisclaimers === undefined || window.acceptedDisclaimers.indexOf(layer.name) === -1)){
    helpers.showTerms(layer.disclaimer.title,
           `The layer you are about to view contains data  which is subject to a licence agreement. 
           Before turning on this layer, you must review the agreement and click 'Accept' or 'Decline'.`, 
           layer.disclaimer.url, helpers.messageColors.gray,
           () => {
             let currentDisclaimers = window.acceptedDisclaimers;
             if (currentDisclaimers === undefined) currentDisclaimers=[];
             currentDisclaimers.push(layer.name);
             window.acceptedDisclaimers = currentDisclaimers;
             returnToFunction();
            },
           () => {},
           );
    return false;
  }else{
    return true;
  }
}

export function turnOnLayers(layers, callback) {
  var newLayers = [];
  for (let index = 0; index < layers.length; index++) {
    const layer = layers[index];
    if (acceptDisclaimer(layer,() => {
          window.emitter.emit("activeTocLayer", { fullName:layer.name, name:layer.displayName,isVisible: layer.layer.getVisible(),layerGroupName:layer.groupName , layerGroup: layer.group, index: layer.index });
        }))
    {
      layer.layer.setVisible(true);
      layer.visible = true;
    }
    let newLayer = Object.assign({}, layer);
    newLayers.push(newLayer);
    if (index === layers.length - 1) callback(newLayers);
  }
}

export function turnOffLayers(layers, callback) {
  var newLayers = [];
  for (let index = 0; index < layers.length; index++) {
    const layer = layers[index];
    layer.layer.setVisible(false);
    layer.visible = false;
    let newLayer = Object.assign({}, layer);
    newLayers.push(newLayer);
    if (index === layers.length - 1) callback(newLayers);
  }
}

export function enableLayersVisiblity(layers, callback) {
  var newLayers = [];
  for (let index = 0; index < layers.length; index++) {
    const layer = layers[index];
    layer.layer.setVisible(layer.visible);
    let newLayer = Object.assign({}, layer);
    newLayers.push(newLayer);
    if (index === layers.length - 1) callback(newLayers);
  }
}

export function resetLayerDefaults(layers, callback) {
  var newLayers = [];
  for (let index = 0; index < layers.length; index++) {
    const layer = layers[index];
    layer.layer.setVisible(false);
    let newLayer = Object.assign({}, layer);
    newLayer.height = 30; // HEIGHT OF DOM ROW FOR AUTOSIZER
    newLayer.showLegend = false; // SHOW LEGEND USING PLUS-MINUS IN TOC
    newLayer.visible = false; // LAYER VISIBLE IN MAP, UPDATED BY CHECKBOX
    newLayers.push(newLayer);
    if (index === layers.length - 1) callback(newLayers);
  }
}

export function updateLayerIndex(layers, callback) {
  var newLayers = [];
  let layerIndex = layers.length + layerIndexStart;
  for (let index = 0; index < layers.length; index++) {
    const layer = layers[index];

    let newLayer = Object.assign({}, layer);
    newLayer.layer.setZIndex(layerIndex);
    newLayer.drawIndex = layerIndex;
    newLayers.push(newLayer);
    if (index === layers.length - 1) callback(newLayers.concat([]));

    layerIndex--;
  }
}

export function getLayerInfo(layerInfo, callback) {
  if (layerInfo.metadataUrl === undefined || layerInfo.metadataUrl === null) return;
  helpers.getJSON(layerInfo.metadataUrl.replace("http:", "https:"), result => {
    const fullInfoUrl = result.layer.resource.href.replace("http:", "https:").split("+").join("%20");
    helpers.getJSON(fullInfoUrl, result => {
      result.featureType.fullUrl = fullInfoUrl.replace("http:", "https:");
      callback(result);
    });
  });
}

export function getStyles(groups) {
  // URL FOR PULLING LEGEND FROM GEOSERVER
  const styleURLTemplate = (serverURL, layerName, styleName) => `${serverURL}/wms?REQUEST=GetLegendGraphic&VERSION=1.0.0&FORMAT=image/png&WIDTH=20&HEIGHT=20&LAYER=${layerName}&STYLE=${styleName}`;

  for (let index = 0; index < groups.length; index++) {
    const group = groups[index];
    //console.log(group)
    let layerList = group.layerList;
    //let layerIndex = 0;
    layerList.forEach(layer => {
      //console.log(layer);
      helpers.getJSON(layer.subLayerInfoURL.replace("http", "https"), subLayerInfo => {
        //console.log(subLayerInfo);
        //layerIndex++;
        let styleURL = "";
        if (subLayerInfo.layer.styles === undefined) {
          //console.log(subLayerInfo)
          // GET FIRST CUSTOM DEFAULT STYLE
          if (subLayerInfo.layer.defaultStyle !== undefined) styleURL = styleURLTemplate(layer.serverURL, subLayerInfo.layer.name, subLayerInfo.layer.defaultStyle.name);
        } else {
          // GET DEFAULT STYLE
          styleURL = styleURLTemplate(layer.serverURL, subLayerInfo.layer.name, subLayerInfo.layer.styles.style[0].name);
          
        }
        
        layer.styleURL = styleURL;
      });
    });
  }
}
