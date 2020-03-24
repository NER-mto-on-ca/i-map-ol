import React, { Component, useState } from "react";
import "./Identify.css";
import * as helpers from "../helpers/helpers";
import mainConfig from "../config.json";
import Collapsible from "react-collapsible";
import { GeoJSON } from "ol/format.js";
import InfoRow from "../helpers/InfoRow.jsx";
import { Vector as VectorSource } from "ol/source.js";
import VectorLayer from "ol/layer/Vector";
import { Circle as CircleStyle, Fill, Stroke, Style } from "ol/style.js";
import { Image as ImageLayer } from "ol/layer.js";
import Feature from "ol/Feature";
import { AutoSizer } from "react-virtualized";
import useIframeContentHeight from "react-use-iframe-content-height";

class Identify extends Component {
  constructor(props) {
    super(props);
    this.state = {
      layers: [],
      isLoading: false
    };

    this.createShadowLayer();
  }

  componentDidMount() {
    this.refreshLayers(this.props);
  }

  componentWillReceiveProps(nextProps) {
    this.refreshLayers(nextProps);
  }

  componentWillUnmount() {
    window.map.removeLayer(this.vectorLayerShadow);
  }

  refreshLayers = props => {
    this.setState({ layers: [], isLoading: true });

    const { geometry } = props;
    const layers = window.map.getLayers().getArray();

    let layerList = [];

    for (let index = 0; index < layers.length; index++) {
      const layer = layers[index];
      if (layer.getVisible() && layer instanceof ImageLayer) {
        const name = layer.get("name");
        let displayName = ""; // layer.get("displayName");
        let html_url = mainConfig.htmlIdentify ? layer.getSource().getFeatureInfoUrl(geometry.flatCoordinates, window.map.getView().getResolution(), "EPSG:3857", { INFO_FORMAT: "text/html" }) + "&feature_count=1000000" : "" ;
        let type = layer.get("identifyDisplayName");
        //let type = layer.get("displayName")
        let wfsUrl = layer.get("wfsUrl");
        if (geometry.getType() !== "Point") {
          const feature = new Feature(geometry);
          const wktString = helpers.getWKTStringFromFeature(feature);
          wfsUrl += "INTERSECTS(geom," + wktString + ")";
          // QUERY USING WFS
          // eslint-disable-next-line
          helpers.getJSON(wfsUrl, result => {
            const featureList = new GeoJSON().readFeatures(result);
            if (featureList.length > 0) {
              if (displayName === "" || displayName === undefined) displayName = this.getDisplayNameFromFeature(featureList[0]);
              let features = [];
              featureList.forEach(feature => {
                features.push(feature);
              });
              if (features.length > 0) layerList.push({ name: name, features: features, displayName: displayName, type: type, html_url: html_url });
              this.setState({ layers: layerList });
            }
          });
        } else {
          // QUERY USING WMS
          var url = layer.getSource().getFeatureInfoUrl(geometry.flatCoordinates, window.map.getView().getResolution(), "EPSG:3857", { INFO_FORMAT: "application/json" });
          url += "&feature_count=1000000";
          if (url) {
            helpers.getJSON(url, result => {
              const features = result.features;
              if (features.length === 0) {
                return;
              }

              const featureList = new GeoJSON().readFeatures(result);
              if (featureList.length > 0) {
                if (displayName === "" || displayName === undefined) displayName = this.getDisplayNameFromFeature(featureList[0]);
                let features = [];
                featureList.forEach(feature => {
                  features.push(feature);
                });
                if (features.length > 0) layerList.push({ name: name, features: features, displayName: displayName, type: type });
                this.setState({ layers: layerList });
              }
            });
          }
        }
      }
    }

    this.setState({ isLoading: false });
  };

  onMouseEnter = feature => {
    this.vectorLayerShadow.getSource().clear();
    this.vectorLayerShadow.getSource().addFeature(feature);
  };

  onMouseLeave = () => {
    this.vectorLayerShadow.getSource().clear();
  };

  createShadowLayer = () => {
    const shadowStyle = new Style({
      stroke: new Stroke({
        color: [0, 255, 255, 0.3],
        width: 6
      }),
      fill: new Fill({
        color: [0, 255, 255, 0.3]
      }),
      image: new CircleStyle({
        radius: 10,
        stroke: new Stroke({
          color: [0, 255, 255, 0.3],
          width: 6
        }),
        fill: new Fill({
          color: [0, 255, 255, 0.3]
        })
      })
    });

    this.vectorLayerShadow = new VectorLayer({
      source: new VectorSource({
        features: []
      }),
      zIndex: 100000,
      style: shadowStyle
    });
    window.map.addLayer(this.vectorLayerShadow);
  };

  getDisplayNameFromFeature = feature => {
    // LOOK FOR EXISTING FIELDS
    const nameFields = ["name", "display_name", "Name", "Display Name"];
    let displayName = "";
    nameFields.forEach(fieldName => {
      if (fieldName.substring(0, 1) !== "_") {
        const name = feature.get(fieldName);
        if (name !== undefined) {
          displayName = fieldName;
          return displayName;
        }
      }
    });

    // FIND FIRST STRING FIELD
    if (displayName === "") {
      for (const [fieldName, value] of Object.entries(feature.values_)) {
        if (fieldName.substring(0, 1) !== "_") {
          if (typeof value === "string" || value instanceof String) {
            displayName = fieldName;
            return displayName;
          }
        }
      }
    }

    //console.log(displayName);
    // STILL NOTHING, SO TAKE FIRST FIELD
    if (displayName === "") displayName = Object.keys(feature.values_)[0];

    return displayName;
  };

  onZoomClick = feature => {
    helpers.zoomToFeature(feature);
  };

  render() {
    return (
      <div>
        <div className={this.state.layers.length === 0 && !this.state.isLoading ? "sc-identify-loading" : "sc-hidden"}>
          No Features were selected. Please try again.
          {/* <img src={images["loading.gif"]}></img> */}
        </div>
        <div className={this.state.isLoading ? "sc-identify-loading" : "sc-hidden"}>
          <img src={images["loading.gif"]} alt="Loading"></img>
        </div>
        <div className={this.state.layers.length === 0 ? "sc-hidden" : "sc-identify-container"}>
          {this.state.layers.map(layer => (
            <Layer key={helpers.getUID()} layer={layer} onZoomClick={this.onZoomClick} onMouseEnter={this.onMouseEnter} onMouseLeave={this.onMouseLeave}></Layer>
          ))}
        </div>
      </div>
    );
  }
}
export default Identify;

function _getLayerObj(layerName, callback) {
  let data= {};
  window.allLayers.forEach(group => {
    group.forEach(layer => {
      if (layer.name.toLowerCase() === layerName.toLowerCase()) data = layer;
    });
  });

  if (callback !== undefined) {
    //console.log(data);
    callback(data);
  }
  return data;
}

const Layer = props => {
  const [open] = useState(true);

  const { layer } = props;

  //console.log(layer);
  let layerObj = {};
  _getLayerObj(layer.name, returnResult => layerObj=returnResult);
 
  return (
    <div id="sc-identify-layer-container">
      <Collapsible trigger={layer.type} open={open}>
        <div className="sc-identify-layer-content-container">
          {props.layer.features.map(feature => (
            <FeatureItem
              key={helpers.getUID()}
              displayName={props.layer.displayName}
              identifyTitleColumn={layerObj !== undefined ? layerObj.identifyTitleColumn : ""}
              identifyIdColumn={layerObj !== undefined ? layerObj.identifyIdColumn : "" }
              feature={feature}
              html_url={layer.html_url}
              onZoomClick={props.onZoomClick}
              onMouseEnter={props.onMouseEnter}
              onMouseLeave={props.onMouseLeave}
              layerName={props.layer.name}
            ></FeatureItem>
          ))}
          
        </div>
      </Collapsible>
    </div>
  );
};

const IFrame = props => {
  let src = props.src;
  const [iframeRef, iframeHeight] = useIframeContentHeight();
  if (props.filter === "" ) {
    return ("");
  }else{
    src += "&CQL_FILTER=" + props.filter;
  }

  return (
      <div className="sc-identiy-feature-iframe">
        <iframe key={helpers.getUID()} ref={iframeRef} height={iframeHeight} src={src}  />
      </div>
    );
}

const FeatureItem = props => {
  const [open, setOpen] = useState(false);
  let { feature, displayName, html_url,identifyTitleColumn,identifyIdColumn } = props;
  if (identifyTitleColumn!==undefined && identifyTitleColumn !== "") displayName = identifyTitleColumn;


  const featureProps = feature.getProperties();
  const keys = Object.keys(featureProps);
  let featureName = feature.get(displayName);

  let layerName = props.layerName;
  if (layerName.split(":").length > 1) {
    layerName = layerName.split(":")[1];
    layerName = helpers.replaceAllInString(layerName, "_", " ");
  }

  // THIS IS FALLBACK IN CASE THERE ARE NO ATTRIBUTES EXCEPT GEOMETRY
  if (displayName === "geometry") {
    if (keys.length === 1) displayName = "No attributes found";
    featureName = "";
  }
  if (featureName === "") featureName = "N/A";
  let cql_filter = "";

  let isSameOrigin = true;
  if (html_url !== undefined) isSameOrigin = html_url.toLowerCase().indexOf(window.location.origin.toLowerCase()) !== -1;

  keys.map((keyName) => {
    const val = featureProps[keyName];
    if (identifyIdColumn !==undefined && identifyIdColumn !== "" ){
      if (cql_filter === "" && (keyName.toLowerCase().indexOf(identifyIdColumn.toLowerCase()) !== -1 && val !== null) && mainConfig.htmlIdentify && isSameOrigin) cql_filter += keyName + "=" + val;
    }else{
      if (cql_filter === "" && (keyName.toLowerCase().indexOf("id") !== -1 && val !== null) && mainConfig.htmlIdentify && isSameOrigin) cql_filter += keyName + "=" + val;
    }
  })
  return (
    <div>
      <div className="sc-identify-feature-header" onMouseEnter={() => props.onMouseEnter(feature)} onMouseLeave={props.onMouseLeave}>
        <div style={{ width: "290px" }} onClick={() => setOpen(!open)}>
          <div className="sc-fakeLink sc-identify-feature-header-label">
            {mainConfig.excludeIdentifyTitleName ? featureName : displayName + ": " + featureName}
          </div>
          <div className="sc-identify-layer-name">{"- " + layerName}</div>
        </div>

        <img className="sc-identify-feature-header-img" src={images["zoom-in.png"]} onClick={() => props.onZoomClick(feature)} alt="Zoom In"></img>
      </div>
  
        
        <div className={open ? "sc-identify-feature-content" : "sc-hidden"}  >
      
        <IFrame key={helpers.getUID()} src={html_url} filter={cql_filter} />
        
        
          {keys.map((keyName, i) => {
            const val = featureProps[keyName];
            if (cql_filter==="" && keyName !== "geometry" && keyName !== "geom" && typeof val !== "object") return <InfoRow key={helpers.getUID()} label={keyName} value={val}></InfoRow>;
            // <div key={helpers.getUID()}>TEST</div>
          })}
        </div>
  
      </div>
  );
};

// IMPORT ALL IMAGES
const images = importAllImages(require.context("./images", false, /\.(png|jpe?g|svg|gif)$/));
function importAllImages(r) {
  let images = {};
  r.keys().map((item, index) => (images[item.replace("./", "")] = r(item)));
  return images;
}
