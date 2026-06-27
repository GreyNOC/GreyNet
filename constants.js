"use strict";

/* =========================================================================
   DEVICE / LINK / ZONE DEFINITIONS
   ========================================================================= */
const DEVICE_TYPES = {
  router:       { label: 'Router',          category: 'Routing & Switching', icon: 'ico-router',       defaultProps: { ip:'', cidr:'24', vlan:'', mac:'', role:'Edge router', notes:'' } },
  l3switch:     { label: 'L3 Switch',       category: 'Routing & Switching', icon: 'ico-l3switch',     defaultProps: { ip:'', cidr:'24', vlan:'', mac:'', role:'Core switch', notes:'' } },
  switch:       { label: 'Switch',          category: 'Routing & Switching', icon: 'ico-switch',       defaultProps: { ip:'', cidr:'24', vlan:'1', mac:'', role:'Access switch', notes:'' } },
  wap:          { label: 'Access Point',    category: 'Routing & Switching', icon: 'ico-wap',          defaultProps: { ip:'', cidr:'24', vlan:'', ssid:'', mac:'', role:'WiFi AP', notes:'' } },

  firewall:     { label: 'Firewall',        category: 'Security',            icon: 'ico-firewall',     defaultProps: { ip:'', cidr:'24', vlan:'', mac:'', role:'Perimeter FW', notes:'' } },
  waf:          { label: 'WAF',             category: 'Security',            icon: 'ico-waf',          defaultProps: { ip:'', cidr:'24', vlan:'', mac:'', role:'Web App Firewall', notes:'' } },
  ids:          { label: 'IDS / IPS',       category: 'Security',            icon: 'ico-ids',          defaultProps: { ip:'', cidr:'24', vlan:'', mac:'', role:'Intrusion detection', notes:'' } },
  vpn:          { label: 'VPN Gateway',     category: 'Security',            icon: 'ico-vpn',          defaultProps: { ip:'', cidr:'24', vlan:'', mac:'', role:'Site-to-site VPN', notes:'' } },
  proxy:        { label: 'Proxy',           category: 'Security',            icon: 'ico-proxy',        defaultProps: { ip:'', cidr:'24', vlan:'', mac:'', role:'Forward proxy', notes:'' } },

  server:       { label: 'Server',          category: 'Servers & Storage',   icon: 'ico-server',       defaultProps: { ip:'', cidr:'24', vlan:'', mac:'', role:'App server', os:'', notes:'' } },
  database:     { label: 'Database',        category: 'Servers & Storage',   icon: 'ico-database',     defaultProps: { ip:'', cidr:'24', vlan:'', mac:'', role:'PostgreSQL', notes:'' } },
  storage:      { label: 'NAS / Storage',   category: 'Servers & Storage',   icon: 'ico-storage',      defaultProps: { ip:'', cidr:'24', vlan:'', mac:'', role:'NAS', notes:'' } },
  loadbalancer: { label: 'Load Balancer',   category: 'Servers & Storage',   icon: 'ico-loadbalancer', defaultProps: { ip:'', cidr:'24', vlan:'', mac:'', role:'L7 LB', notes:'' } },

  workstation:  { label: 'Workstation',     category: 'Endpoints',           icon: 'ico-workstation',  defaultProps: { ip:'', cidr:'24', vlan:'', mac:'', role:'User PC', os:'', notes:'' } },
  laptop:       { label: 'Laptop',          category: 'Endpoints',           icon: 'ico-laptop',       defaultProps: { ip:'', cidr:'24', vlan:'', mac:'', role:'User laptop', os:'', notes:'' } },
  mobile:       { label: 'Smartphone',      category: 'Endpoints',           icon: 'ico-mobile',       defaultProps: { ip:'', cidr:'24', vlan:'', mac:'', role:'Mobile device', os:'iOS / Android', mdm:'', notes:'' } },
  tablet:       { label: 'Tablet',          category: 'Endpoints',           icon: 'ico-tablet',       defaultProps: { ip:'', cidr:'24', vlan:'', mac:'', role:'Tablet', os:'', mdm:'', notes:'' } },
  phone:        { label: 'VoIP Phone',      category: 'Endpoints',           icon: 'ico-phone',        defaultProps: { ip:'', cidr:'24', vlan:'10', mac:'', role:'VoIP', notes:'' } },
  printer:      { label: 'Printer',         category: 'Endpoints',           icon: 'ico-printer',      defaultProps: { ip:'', cidr:'24', vlan:'', mac:'', role:'Network printer', notes:'' } },
  iot:          { label: 'IoT Device',      category: 'Endpoints',           icon: 'ico-iot',          defaultProps: { ip:'', cidr:'24', vlan:'', mac:'', role:'IoT', notes:'' } },
  camera:       { label: 'IP Camera',       category: 'Endpoints',           icon: 'ico-camera',       defaultProps: { ip:'', cidr:'24', vlan:'', mac:'', role:'CCTV', notes:'' } },

  cloud:        { label: 'Cloud',           category: 'External',            icon: 'ico-cloud',        defaultProps: { provider:'AWS', region:'', notes:'' } },
  internet:     { label: 'Internet',        category: 'External',            icon: 'ico-internet',     defaultProps: { notes:'' } },
};

const LINK_TYPES = {
  ethernet: { label: 'Ethernet',    color: 'var(--link-eth)',   width: 2,   dash: null  },
  fiber:    { label: 'Fiber',       color: 'var(--link-fiber)', width: 3,   dash: null  },
  wireless: { label: 'Wireless',    color: 'var(--link-wifi)',  width: 2,   dash: '5 4' },
  vpn:      { label: 'VPN tunnel',  color: 'var(--link-vpn)',   width: 2.5, dash: '2 4' },
  trunk:    { label: 'Trunk (LACP)',color: 'var(--link-trunk)', width: 3.5, dash: null  },
};

const ZONE_TYPES = {
  internet: { label: 'Internet',  fill:'rgba(255,107,107,0.10)', stroke:'#ff6b6b', labelColor:'#ff8888' },
  dmz:      { label: 'DMZ',       fill:'rgba(245,200,76,0.10)',  stroke:'#f5c84c', labelColor:'#f5d77a' },
  internal: { label: 'Internal',  fill:'rgba(111,207,151,0.10)', stroke:'#6fcf97', labelColor:'#8fdfa9' },
  mgmt:     { label: 'Management',fill:'rgba(95,179,255,0.10)',  stroke:'#5fb3ff', labelColor:'#85c3ff' },
  guest:    { label: 'Guest',     fill:'rgba(179,136,235,0.10)', stroke:'#b388eb', labelColor:'#c4a4ef' },
};

const SITE_TYPES = {
  datacenter:  { label: 'Data Center / Server Farm', icon: 'site-datacenter',  color: '#5fb3ff' },
  noc:         { label: 'NOC (Network Ops)',         icon: 'site-noc',         color: '#6fcf97' },
  soc:         { label: 'SOC (Security Ops)',        icon: 'site-soc',         color: '#ff8c42' },
  office:      { label: 'Corporate Office (HQ)',     icon: 'site-office',      color: '#b388eb' },
  branch:      { label: 'Branch Office',             icon: 'site-branch',      color: '#a1d2ff' },
  warehouse:   { label: 'Warehouse / Distribution',  icon: 'site-warehouse',   color: '#f5c84c' },
  factory:     { label: 'Factory / Plant',           icon: 'site-factory',     color: '#d4a017' },
  retail:      { label: 'Retail Store',              icon: 'site-retail',      color: '#ff6b6b' },
  cloudregion: { label: 'Cloud Region',              icon: 'site-cloudregion', color: '#85c3ff' },
};

const SITE_LINK_TYPES = {
  wan:        { label: 'WAN',          color: '#8a95a4', width: 2,   dash: null     },
  vpn:        { label: 'Site-to-Site VPN', color: '#b388eb', width: 2,   dash: '4 4' },
  sdwan:      { label: 'SD-WAN',       color: '#5fb3ff', width: 2.5, dash: null     },
  mpls:       { label: 'MPLS',         color: '#6fcf97', width: 3,   dash: null     },
  leased:     { label: 'Leased Line',  color: '#ff8c42', width: 3,   dash: null     },
};

// City-scale endpoint types (traffic + city infrastructure)
const ENDPOINT_TYPES = {
  building:       { label: 'Building',          icon: 'ep-building',       color: '#5fb3ff', defaultProps: { address:'', ip:'', notes:'' } },
  trafficsignal:  { label: 'Traffic Signal',    icon: 'ep-trafficsignal',  color: '#f5c84c', defaultProps: { intersection:'', controller:'', ip:'', vlan:'', notes:'' } },
  trafficcam:     { label: 'Traffic Camera',    icon: 'ep-trafficcam',     color: '#ff8c42', defaultProps: { ip:'', stream:'', vlan:'', notes:'' } },
  vehiclesensor:  { label: 'Vehicle Sensor',    icon: 'ep-vehiclesensor',  color: '#6fcf97', defaultProps: { sensorType:'Inductive loop', ip:'', vlan:'', notes:'' } },
  messagesign:    { label: 'Message Sign (VMS)',icon: 'ep-messagesign',    color: '#b388eb', defaultProps: { ip:'', controller:'', notes:'' } },
  cabinet:        { label: 'Roadside Cabinet',  icon: 'ep-cabinet',        color: '#85c3ff', defaultProps: { cabinetId:'', ip:'', power:'120V', notes:'' } },
  streetlight:    { label: 'Smart Streetlight', icon: 'ep-streetlight',    color: '#ffe6a8', defaultProps: { ip:'', lumens:'', notes:'' } },
  fiberjunction:  { label: 'Fiber Junction',    icon: 'ep-fiberjunction',  color: '#a1d2ff', defaultProps: { boxId:'', strands:'24', notes:'' } },
};

// City-scale link types — physical infrastructure between endpoints
const CITY_LINK_TYPES = {
  fiber_buried: { label: 'Fiber (buried)',  color: '#ff8c42', width: 3,   dash: null     },
  fiber_aerial: { label: 'Fiber (aerial)',  color: '#f5c84c', width: 2.5, dash: '8 4'    },
  copper:       { label: 'Copper / DSL',    color: '#8a95a4', width: 2,   dash: null     },
  microwave:    { label: 'Microwave',       color: '#5fb3ff', width: 2,   dash: '2 4'    },
  cellular:     { label: 'Cellular backhaul', color: '#b388eb', width: 2.5, dash: '4 2 2 2' },
};

// Available city map backends
const CITY_BACKENDS = {
  image: { label: 'Image (offline)',  needsInternet: false },
  osm:   { label: 'OpenStreetMap',    needsInternet: true  },
  gmaps: { label: 'Google Maps',      needsInternet: true, needsKey: true },
};

// === SPACE ASSETS ===
// Orbital altitudes (km) used for default radii in space view
const ORBIT_ALTITUDES = {
  leo:  { km:  550, label: 'LEO',          radius: 380 },
  iss:  { km:  408, label: 'ISS / Station',radius: 360 },
  meo:  { km: 8000, label: 'MEO',          radius: 540 },
  geo:  { km:35786, label: 'GEO',          radius: 720 },
  deep: { km:99999, label: 'Cislunar / Deep', radius: 900 },
};

const SPACE_ASSET_TYPES = {
  satellite_leo:  { label: 'LEO Satellite',       icon: 'sa-satellite',  color: '#6fcf97', orbit: 'leo',
    purpose: 'General-purpose low-Earth orbit comms', stats: { coverage_km: 1200, bandwidth: '1 Gbps', power_w: 800, security: 'TLS' } },
  satellite_meo:  { label: 'MEO Satellite (GPS)', icon: 'sa-satellite',  color: '#f5c84c', orbit: 'meo',
    purpose: 'Medium-orbit positioning / GNSS',     stats: { coverage_km: 4500, bandwidth: '50 Mbps', power_w: 1500, security: 'L-band' } },
  satellite_geo:  { label: 'GEO Satellite',       icon: 'sa-satellite',  color: '#ff8c42', orbit: 'geo',
    purpose: 'Geostationary broadcast / hub',       stats: { coverage_km: 17500, bandwidth: '10 Gbps', power_w: 9000, security: 'Ka-band' } },
  station:        { label: 'Space Station',       icon: 'sa-station',    color: '#85c3ff', orbit: 'iss',
    purpose: 'Crewed orbital outpost',              stats: { coverage_km: 2000, bandwidth: '600 Mbps', power_w: 90000, security: 'Hardened' } },
  ground_station: { label: 'Ground Station',      icon: 'sa-ground',     color: '#a1d2ff', orbit: 'ground',
    purpose: 'Earth-side uplink/downlink',          stats: { coverage_km: 2200, bandwidth: '40 Gbps', power_w: 50000, security: 'TLS+VPN' } },
  constellation:  { label: 'Constellation Node',  icon: 'sa-constellation', color: '#b388eb', orbit: 'leo',
    purpose: 'Mesh comms node in a LEO swarm',      stats: { coverage_km: 900, bandwidth: '4 Gbps', power_w: 600, security: 'Mesh' } },
  relay:          { label: 'Relay Satellite',     icon: 'sa-relay',      color: '#5fb3ff', orbit: 'geo',
    purpose: 'Multi-link cross-orbit relay',        stats: { coverage_km: 22000, bandwidth: '20 Gbps', power_w: 12000, security: 'Ka/Optical' } },
  // === New units added for richer Orbit layer ===
  defense_node:   { label: 'Defense Node',        icon: 'sa-defense',    color: '#ff6b6b', orbit: 'meo',
    purpose: 'Orbital threat-detection + counter',  stats: { coverage_km: 6000, bandwidth: '100 Mbps', power_w: 4000, security: 'MILSPEC' } },
  monitor_sat:    { label: 'Monitoring Sat',      icon: 'sa-monitor',    color: '#85e3ff', orbit: 'leo',
    purpose: 'Earth/asset monitoring + telemetry',  stats: { coverage_km: 1500, bandwidth: '500 Mbps', power_w: 1200, security: 'Encrypted' } },
  gps_nav:        { label: 'GPS / Nav Unit',      icon: 'sa-gps',        color: '#ffd76a', orbit: 'meo',
    purpose: 'Precise time + position service',     stats: { coverage_km: 5000, bandwidth: '20 Mbps', power_w: 1100, security: 'Authenticated' } },
  comm_array:     { label: 'Comm Array',          icon: 'sa-commarray',  color: '#5fb3ff', orbit: 'geo',
    purpose: 'High-capacity directional comms',     stats: { coverage_km: 18000, bandwidth: '40 Gbps', power_w: 14000, security: 'Phased-array' } },
  orbit_firewall: { label: 'Orbital Firewall',    icon: 'sa-firewall',   color: '#f5a14c', orbit: 'leo',
    purpose: 'Inline traffic inspection in orbit',  stats: { coverage_km: 1000, bandwidth: '8 Gbps', power_w: 3200, security: 'L7-DPI' } },
  data_router:    { label: 'Data Routing Sat',    icon: 'sa-router',     color: '#6fcf97', orbit: 'geo',
    purpose: 'BGP-like orbital data routing',       stats: { coverage_km: 16000, bandwidth: '30 Gbps', power_w: 8000, security: 'IPsec' } },
};

const SPACE_LINK_TYPES = {
  laser_isl: { label: 'Laser ISL',     color: '#85e3ff', width: 2,   dash: null     },
  rf_isl:    { label: 'RF ISL',        color: '#b388eb', width: 2,   dash: '6 3'    },
  uplink:    { label: 'Ground Uplink', color: '#6fcf97', width: 2.5, dash: '4 2 2 2'},
  downlink:  { label: 'Downlink',      color: '#f5c84c', width: 2.5, dash: '2 4'    },
  feeder:    { label: 'Feeder Link',   color: '#ff8c42', width: 2,   dash: null     },
};

// === PLANET-LEVEL GLOBAL INFRASTRUCTURE ===
// Placeable on the Planet view ALONGSIDE physical sites — represents global,
// non-site infrastructure (data centers can also exist as sites, but these are
// the "global mesh" pieces that justify the planet layer being more than a map
// of buildings).
const PLANET_INFRA_TYPES = {
  global_dc:   { label: 'Global Data Center', icon: 'pi-datacenter', color: '#5fb3ff',
    purpose: 'Continental compute hub',     defaultProps: { region:'', tier:'III', cores:'10k', notes:'' } },
  ground_uplink: { label: 'Satellite Uplink', icon: 'pi-uplink',     color: '#85e3ff',
    purpose: 'Earth↔Orbit comms gateway',   defaultProps: { dishM:'9.0', band:'Ka', notes:'' } },
  sensor_array: { label: 'Sensor Array',     icon: 'pi-sensor',     color: '#6fcf97',
    purpose: 'Distributed Earth sensing',   defaultProps: { sensorType:'multispectral', notes:'' } },
  comm_tower:  { label: 'Comm Tower',         icon: 'pi-tower',      color: '#f5c84c',
    purpose: 'Regional broadcast tower',    defaultProps: { heightM:'200', notes:'' } },
  ai_center:   { label: 'AI Monitor Center', icon: 'pi-ai',          color: '#b388eb',
    purpose: 'AI-driven anomaly detection', defaultProps: { gpus:'512', notes:'' } },
  backup_node: { label: 'Backup Node',       icon: 'pi-backup',      color: '#a1d2ff',
    purpose: 'Cold-storage redundancy',     defaultProps: { capacityTB:'400', notes:'' } },
  security_gw: { label: 'Security Gateway',  icon: 'pi-secgw',       color: '#ff8c42',
    purpose: 'Border traffic inspection',   defaultProps: { throughput:'40 Gbps', notes:'' } },
};

// === DEEP SPACE PLACEABLE UNITS ===
// In addition to the heliocentric Link Budget Studio, the user can now place
// actual deep-space units in a separate "deep-space mesh" view. These attach
// to a target planet/region and form a layer that connects back to orbital
// assets through DEEP_SPACE_LINK_TYPES.
const DEEP_SPACE_UNIT_TYPES = {
  ds_relay:        { label: 'Deep-Space Relay',     icon: 'ds-relay',    color: '#5fb3ff',
    purpose: 'Long-range data relay',     stats: { range_au: 3.0, bandwidth: '8 Mbps', power_w: 4000, security: 'AES-256' } },
  ds_probe:        { label: 'Probe',                icon: 'ds-probe',    color: '#85e3ff',
    purpose: 'Autonomous exploration probe', stats: { range_au: 40.0, bandwidth: '160 kbps', power_w: 400, security: 'Authenticated' } },
  ds_sensor:       { label: 'Long-Range Sensor',    icon: 'ds-sensor',   color: '#6fcf97',
    purpose: 'Wide-field sensor / telescope', stats: { range_au: 100, bandwidth: '20 Mbps', power_w: 1600, security: 'Signed' } },
  ds_quantum:      { label: 'Quantum Comm Gateway', icon: 'ds-quantum',  color: '#b388eb',
    purpose: 'Entanglement-class link',   stats: { range_au: 50, bandwidth: '1 Mbps', power_w: 12000, security: 'QKD' } },
  ds_research:     { label: 'Research Station',     icon: 'ds-research', color: '#a1d2ff',
    purpose: 'Crewed deep-space outpost', stats: { range_au: 5.0, bandwidth: '400 Mbps', power_w: 80000, security: 'Hardened' } },
  ds_signal_amp:   { label: 'Signal Amplifier',     icon: 'ds-amp',      color: '#ffd76a',
    purpose: 'Boost relay-chain SNR',     stats: { range_au: 10.0, bandwidth: '50 Mbps', power_w: 2200, security: 'TLS' } },
  ds_threat_array: { label: 'Threat Detection Array', icon: 'ds-threat', color: '#ff6b6b',
    purpose: 'Anomaly / threat scanning', stats: { range_au: 25, bandwidth: '60 Mbps', power_w: 6000, security: 'MILSPEC' } },
  ds_archive:      { label: 'Data Archive Node',    icon: 'ds-archive',  color: '#f5c84c',
    purpose: 'Long-term cold archive',    stats: { range_au: 1.0, bandwidth: '100 Mbps', power_w: 5000, security: 'WORM' } },
  ds_explorer:     { label: 'Autonomous Explorer',  icon: 'ds-explorer', color: '#ff8c42',
    purpose: 'Self-directed scout craft', stats: { range_au: 80, bandwidth: '120 kbps', power_w: 300, security: 'Signed' } },
  ds_backup:       { label: 'Emergency Backup',     icon: 'ds-backup',   color: '#8fbcdf',
    purpose: 'Failover redundancy node',  stats: { range_au: 2.0, bandwidth: '60 Mbps', power_w: 3200, security: 'TLS' } },
};

const DEEP_SPACE_LINK_TYPES = {
  ds_laser:    { label: 'Laser Link',      color: '#85e3ff', width: 2,   dash: null     },
  ds_quantum:  { label: 'Quantum Link',    color: '#b388eb', width: 2.5, dash: '4 2'    },
  ds_relay:    { label: 'Relay Hop',       color: '#5fb3ff', width: 2,   dash: '6 3'    },
  ds_dsn:      { label: 'DSN Downlink',    color: '#6fcf97', width: 2.5, dash: '4 2 2 2'},
  ds_redundant:{ label: 'Redundant Path',  color: '#f5a14c', width: 1.5, dash: '2 4'    },
};

// Stylized continent polygons in lng/lat space, projected to world coords
// by latLngToWorld(lat, lng). Map spans (0,0) to (3600, 1800).
const CONTINENT_POLYGONS = [
  // North America
  [[-165,68],[-150,72],[-130,73],[-110,75],[-90,77],[-78,72],[-65,62],[-55,52],
   [-58,48],[-67,46],[-72,42],[-77,36],[-82,27],[-94,18],[-105,22],[-115,28],
   [-122,34],[-125,42],[-130,52],[-138,58],[-152,60],[-162,60],[-167,62]],
  // Greenland
  [[-50,80],[-30,82],[-22,76],[-30,68],[-42,62],[-52,68],[-54,75]],
  // South America
  [[-78,12],[-65,11],[-55,5],[-50,0],[-40,-2],[-37,-10],[-38,-22],[-40,-25],
   [-50,-33],[-58,-38],[-65,-42],[-72,-52],[-72,-46],[-73,-30],[-78,-20],[-80,-5]],
  // Europe
  [[-9,36],[0,38],[10,42],[20,40],[27,40],[30,45],[35,45],[40,46],[45,50],
   [55,55],[55,65],[40,68],[25,70],[10,68],[-2,62],[-8,55],[-10,45]],
  // Africa
  [[-12,35],[5,33],[18,32],[28,33],[34,30],[36,18],[44,12],[51,12],[52,2],
   [42,-12],[40,-22],[32,-32],[20,-34],[15,-25],[12,-15],[8,-3],[0,3],
   [-8,7],[-14,12],[-17,20],[-17,28]],
  // Asia
  [[35,40],[45,42],[55,42],[60,45],[65,50],[72,57],[80,62],[90,68],[105,72],
   [120,73],[140,72],[155,72],[170,68],[178,60],[170,55],[155,52],[145,48],
   [140,40],[135,33],[125,25],[115,22],[110,18],[105,12],[100,12],[97,16],
   [93,22],[88,22],[85,14],[80,8],[75,10],[68,22],[60,25],[55,25],[48,28],
   [42,32],[40,38]],
  // Australia
  [[114,-12],[124,-12],[135,-13],[142,-11],[145,-15],[150,-23],[152,-30],
   [149,-36],[140,-38],[130,-32],[120,-32],[115,-30],[113,-22]],
  // Antarctica strip
  [[-180,-65],[180,-65],[180,-78],[140,-72],[80,-70],[0,-78],[-90,-72],[-180,-70]],
];

function latLngToWorld(lat, lng) {
  return { x: (lng + 180) * 10, y: (90 - lat) * 10 };
}
function worldToLatLng(x, y) {
  return { lat: 90 - y / 10, lng: x / 10 - 180 };
}

// Major global cities — used as city lights on the night map
const MAJOR_CITY_ROWS = [
  // Americas
  ['New York',     40.71,  -74.00, true ],
  ['Washington',   38.91,  -77.04, false],
  ['Boston',       42.36,  -71.06, false],
  ['Toronto',      43.65,  -79.38, false],
  ['Chicago',      41.88,  -87.63, false],
  ['Los Angeles',  34.05, -118.24, true ],
  ['San Francisco',37.77, -122.42, false],
  ['Vancouver',    49.28, -123.12, false],
  ['Mexico City',  19.43,  -99.13, true ],
  ['Bogotá',        4.71,  -74.07, false],
  ['Lima',        -12.05,  -77.04, false],
  ['São Paulo',   -23.55,  -46.63, true ],
  ['Rio de Janeiro',-22.91, -43.17,false],
  ['Buenos Aires',-34.61,  -58.38, false],
  // Europe
  ['London',       51.51,   -0.13, true ],
  ['Paris',        48.86,    2.35, true ],
  ['Madrid',       40.42,   -3.70, false],
  ['Lisbon',       38.72,   -9.14, false],
  ['Rome',         41.90,   12.50, false],
  ['Berlin',       52.52,   13.40, false],
  ['Amsterdam',    52.37,    4.90, false],
  ['Stockholm',    59.33,   18.07, false],
  ['Warsaw',       52.23,   21.01, false],
  ['Moscow',       55.75,   37.62, true ],
  ['Istanbul',     41.01,   28.98, true ],
  // Africa & Middle East
  ['Cairo',        30.04,   31.24, true ],
  ['Lagos',         6.52,    3.38, true ],
  ['Nairobi',      -1.29,   36.82, false],
  ['Johannesburg',-26.20,   28.05, false],
  ['Cape Town',   -33.93,   18.42, false],
  ['Dubai',        25.20,   55.27, true ],
  ['Riyadh',       24.71,   46.68, false],
  ['Tehran',       35.69,   51.39, false],
  // Asia
  ['Karachi',      24.86,   67.01, false],
  ['Mumbai',       19.08,   72.88, true ],
  ['Delhi',        28.61,   77.21, true ],
  ['Bengaluru',    12.97,   77.59, false],
  ['Dhaka',        23.81,   90.41, false],
  ['Bangkok',      13.76,  100.50, false],
  ['Singapore',     1.35,  103.82, true ],
  ['Jakarta',      -6.21,  106.85, true ],
  ['Manila',       14.60,  120.98, false],
  ['Hong Kong',    22.32,  114.17, true ],
  ['Taipei',       25.03,  121.57, false],
  ['Shanghai',     31.23,  121.47, true ],
  ['Beijing',      39.90,  116.41, true ],
  ['Seoul',        37.57,  126.98, true ],
  ['Tokyo',        35.68,  139.65, true ],
  ['Osaka',        34.69,  135.50, false],
  // Oceania
  ['Sydney',      -33.87,  151.21, true ],
  ['Melbourne',   -37.81,  144.96, false],
  ['Auckland',    -36.85,  174.76, false],
];

const MAJOR_CITY_COUNTRIES = {
  'New York': 'United States',
  'Washington': 'United States',
  'Boston': 'United States',
  'Toronto': 'Canada',
  'Chicago': 'United States',
  'Los Angeles': 'United States',
  'San Francisco': 'United States',
  'Vancouver': 'Canada',
  'Mexico City': 'Mexico',
  'BogotÃ¡': 'Colombia',
  'Lima': 'Peru',
  'SÃ£o Paulo': 'Brazil',
  'Rio de Janeiro': 'Brazil',
  'Buenos Aires': 'Argentina',
  'London': 'United Kingdom',
  'Paris': 'France',
  'Madrid': 'Spain',
  'Lisbon': 'Portugal',
  'Rome': 'Italy',
  'Berlin': 'Germany',
  'Amsterdam': 'Netherlands',
  'Stockholm': 'Sweden',
  'Warsaw': 'Poland',
  'Moscow': 'Russia',
  'Istanbul': 'Turkey',
  'Cairo': 'Egypt',
  'Lagos': 'Nigeria',
  'Nairobi': 'Kenya',
  'Johannesburg': 'South Africa',
  'Cape Town': 'South Africa',
  'Dubai': 'United Arab Emirates',
  'Riyadh': 'Saudi Arabia',
  'Tehran': 'Iran',
  'Karachi': 'Pakistan',
  'Mumbai': 'India',
  'Delhi': 'India',
  'Bengaluru': 'India',
  'Dhaka': 'Bangladesh',
  'Bangkok': 'Thailand',
  'Singapore': 'Singapore',
  'Jakarta': 'Indonesia',
  'Manila': 'Philippines',
  'Hong Kong': 'Hong Kong',
  'Taipei': 'Taiwan',
  'Shanghai': 'China',
  'Beijing': 'China',
  'Seoul': 'South Korea',
  'Tokyo': 'Japan',
  'Osaka': 'Japan',
  'Sydney': 'Australia',
  'Melbourne': 'Australia',
  'Auckland': 'New Zealand',
};

const MAJOR_CITIES = MAJOR_CITY_ROWS.map(([name, lat, lng, big]) => ({
  name,
  lat,
  lng,
  big,
  country: MAJOR_CITY_COUNTRIES[name] || '',
}));

// Major airline routes — animated planes follow these curves
const FLIGHT_ROUTES = [
  // [fromLat, fromLng, toLat, toLng, durationSec]
  [ 40.71,  -74.00,  51.51,   -0.13, 38],  // JFK → LHR
  [ 51.51,   -0.13,  25.20,   55.27, 34],  // LHR → DXB
  [ 25.20,   55.27,   1.35,  103.82, 32],  // DXB → SIN
  [  1.35,  103.82, -33.87,  151.21, 30],  // SIN → SYD
  [ 34.05, -118.24,  35.68,  139.65, 42],  // LAX → NRT
  [ 37.57,  126.98,  40.71,  -74.00, 44],  // ICN → JFK
  [ 22.32,  114.17,  34.05, -118.24, 40],  // HKG → LAX
  [-23.55,  -46.63,  40.42,   -3.70, 36],  // GRU → MAD
  [ 19.08,   72.88,  51.51,   -0.13, 32],  // BOM → LHR
  [ 30.04,   31.24,  41.01,   28.98, 16],  // CAI → IST
];

// Simple orbital paths (in world coords directly)
// Sat moves around the world map cyclically
const SATELLITE_ORBITS = [
  { dur: 90,  yLow: 900, yHigh: 900, color: '#5fb3ff', label: 'GEO-1' },     // equatorial
  { dur: 95,  yLow: 900, yHigh: 900, color: '#5fb3ff', label: 'GEO-2', delay: -45 },
  { dur: 38,  yLow: 720, yHigh: 1080, color: '#85e3ff', label: 'LEO-1' },    // inclined LEO
  { dur: 32,  yLow: 600, yHigh: 1200, color: '#85e3ff', label: 'LEO-2', delay: -10 },
];

// USD CAPEX + annual license; per-unit. Defaults — override in device props.cost
const COST_CATALOG = {
  router:       { capex: 1500, license: 0,    label: 'Router (mid-tier)' },
  l3switch:     { capex: 5000, license: 0,    label: 'L3 switch (48-port)' },
  switch:       { capex: 800,  license: 0,    label: 'L2 switch (24-port)' },
  wap:          { capex: 350,  license: 50,   label: 'Enterprise WAP' },
  firewall:     { capex: 4000, license: 1200, label: 'NGFW + subscription' },
  waf:          { capex: 8000, license: 2400, label: 'WAF + subscription' },
  ids:          { capex: 6000, license: 1800, label: 'IDS/IPS + signatures' },
  vpn:          { capex: 2500, license: 600,  label: 'VPN gateway' },
  proxy:        { capex: 1500, license: 400,  label: 'Forward proxy' },
  server:       { capex: 5000, license: 800,  label: 'Rack server + OS' },
  database:     { capex: 6000, license: 1500, label: 'DB server + license' },
  storage:      { capex: 4000, license: 300,  label: 'NAS unit' },
  loadbalancer: { capex: 7000, license: 1500, label: 'L7 load balancer' },
  workstation:  { capex: 1200, license: 200,  label: 'Desktop PC + OS' },
  laptop:       { capex: 1400, license: 200,  label: 'Business laptop' },
  mobile:       { capex: 800,  license: 60,   label: 'Corporate smartphone + MDM' },
  tablet:       { capex: 600,  license: 60,   label: 'Tablet + MDM' },
  phone:        { capex: 250,  license: 0,    label: 'VoIP desk phone' },
  printer:      { capex: 600,  license: 0,    label: 'Network printer' },
  iot:          { capex: 100,  license: 0,    label: 'IoT sensor' },
  camera:       { capex: 250,  license: 0,    label: 'IP camera' },
  cloud:        { capex: 0,    license: 0,    label: 'Cloud subscription (varies)' },
  internet:     { capex: 0,    license: 0,    label: 'ISP service (varies)' },
};
const OPEX_RATE = 0.18; // 18% of CAPEX/year for maintenance, support, power

const SEVERITY = {
  critical: { rank: 0, color: '#ff4d4d', label: 'CRITICAL', weight: 25 },
  high:     { rank: 1, color: '#ff8c42', label: 'HIGH',     weight: 15 },
  medium:   { rank: 2, color: '#f5c84c', label: 'MEDIUM',   weight: 8  },
  low:      { rank: 3, color: '#5fb3ff', label: 'LOW',      weight: 4  },
  info:     { rank: 4, color: '#8a95a4', label: 'INFO',     weight: 1  },
};
