// ============================================================
// 全球数据中心地图 — 应用逻辑 v4.8
// ============================================================
let map, markerCluster, allMarkers = [], activeMarker = null;
let currentFilter = 'all', currentContinent = 'all', currentCountry = '';

const satelliteLayer = L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', {
  attribution: 'Tiles &copy; Esri', maxZoom: 19
});
const labelLayer = L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/Reference/World_Boundaries_and_Places/MapServer/tile/{z}/{y}/{x}', {
  maxZoom: 19, pane: 'overlayPane'
});
const standardLayer = L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
  attribution: '&copy; OpenStreetMap', maxZoom: 19
});
const darkLayer = L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', {
  attribution: '&copy; CartoDB', maxZoom: 19
});

const COLOR_MAP = {'cloud-giant':'#4facfe','third-party':'#ff6b6b','telecom':'#ffd93d','national-hub':'#00e676','gov-enterprise':'#b388ff','ai-computing':'#ff9100'};
const TYPE_NAMES = {'cloud-giant':'云厂商','third-party':'第三方IDC','telecom':'运营商','national-hub':'国家枢纽','gov-enterprise':'政企','ai-computing':'智算中心'};

// Continent center views for fly-to
const CONTINENT_VIEWS = {
  'all': {center: [20, 0], zoom: 2},
  '亚洲': {center: [30, 105], zoom: 3},
  '北美洲': {center: [40, -100], zoom: 4},
  '欧洲': {center: [50, 10], zoom: 4},
  '南美洲': {center: [-15, -55], zoom: 4},
  '非洲': {center: [5, 25], zoom: 4},
  '大洋洲': {center: [-28, 145], zoom: 4}
};

function initMap() {
  map = L.map('map', { center: [20, 0], zoom: 3, zoomControl: false, layers: [satelliteLayer, labelLayer], worldCopyJump: true });
  L.control.zoom({ position: 'topright' }).addTo(map);

  markerCluster = L.markerClusterGroup({
    maxClusterRadius: 50, spiderfyOnMaxZoom: true, showCoverageOnHover: false,
    iconCreateFunction: function(cluster) {
      const c = cluster.getChildCount();
      const s = c < 10 ? 40 : c < 30 ? 50 : 60;
      return L.divIcon({
        html: '<div style="width:'+s+'px;height:'+s+'px;border-radius:50%;background:rgba(79,172,254,.7);border:2px solid rgba(255,255,255,.8);display:flex;align-items:center;justify-content:center;color:#fff;font-weight:700;font-size:14px;box-shadow:0 2px 12px rgba(79,172,254,.5)">'+c+'</div>',
        className: 'custom-cluster', iconSize: [s, s]
      });
    }
  });

  datacenters.forEach(function(dc, i) {
    const isLarge = dc.scale === '\u8d85\u5927\u89c4\u6a21';
    const color = COLOR_MAP[dc.type] || '#4facfe';
    const sz = isLarge ? 16 : 12;
    const shortName = dc.name.length > 14 ? dc.name.substring(0, 14) + '\u2026' : dc.name;
    const pulseClass = dc.type === 'national-hub' ? ' national-hub' : dc.type === 'ai-computing' ? ' ai-computing' : '';

    const icon = L.divIcon({
      html: '<div class="dc-marker' + pulseClass + '" style="background:'+color+';width:'+sz*2+'px;height:'+sz*2+'px"><div class="dc-marker-label">'+shortName+'</div></div>',
      className: 'dc-marker-container', iconSize: [sz*2, sz*2], iconAnchor: [sz, sz]
    });

    const marker = L.marker([dc.lat, dc.lng], { icon: icon });
    marker.dcData = dc;
    marker.dcIndex = i;
    marker.on('click', function() { showDetail(dc, marker); });
    marker.bindTooltip('<b>'+dc.name+'</b><br>'+dc.operator+' · '+(dc.country||'')+', '+dc.city+'<br>'+dc.scale, {
      direction: 'top', offset: [0, -sz], className: 'dc-tooltip'
    });
    allMarkers.push(marker);
    markerCluster.addLayer(marker);
  });

  map.addLayer(markerCluster);
  updateList();
  updateStats();
  setTimeout(function() { document.getElementById('loading').classList.add('hide'); }, 800);
}

function updateStats() {
  var visible = getFilteredDCs();
  document.getElementById('stat-total').textContent = visible.length;
  var cities = {}, ops = {}, countries = {}, types = {};
  visible.forEach(function(d) {
    cities[d.city] = 1;
    ops[d.operator] = 1;
    countries[d.country || 'Unknown'] = (countries[d.country || 'Unknown'] || 0) + 1;
    types[d.type] = (types[d.type] || 0) + 1;
  });
  document.getElementById('stat-cities').textContent = Object.keys(cities).length;
  document.getElementById('stat-operators').textContent = Object.keys(ops).length;
  var countriesEl = document.getElementById('stat-countries');
  if (countriesEl) countriesEl.textContent = Object.keys(countries).length;

  // Type stats
  var typeHtml = '';
  Object.keys(TYPE_NAMES).forEach(function(t) {
    if (types[t]) {
      typeHtml += '<div class="type-stat-item"><div class="type-stat-dot" style="background:'+COLOR_MAP[t]+'"></div><span class="type-stat-count">'+types[t]+'</span><span class="type-stat-name">'+TYPE_NAMES[t]+'</span></div>';
    }
  });
  var typeStatsEl = document.getElementById('type-stats');
  if (typeStatsEl) typeStatsEl.innerHTML = typeHtml;

  // Country top 10
  var countryArr = Object.keys(countries).map(function(c) { return { name: c, count: countries[c] }; });
  countryArr.sort(function(a, b) { return b.count - a.count; });
  var top10 = countryArr.slice(0, 10);
  var maxCount = top10.length ? top10[0].count : 1;
  var countryHtml = '';
  top10.forEach(function(c) {
    var pct = Math.round(c.count / maxCount * 100);
    var activeClass = currentCountry === c.name ? ' active-prov' : '';
    countryHtml += '<div class="province-bar'+activeClass+'" onclick="filterByCountry(\''+c.name.replace(/'/g, "\\'")+'\')" title="点击筛选'+c.name+'"><span class="province-bar-name">'+c.name+'</span><div class="province-bar-track"><div class="province-bar-fill" style="width:'+pct+'%"></div></div><span class="province-bar-count">'+c.count+'</span></div>';
  });
  var countryStatsEl = document.getElementById('country-stats');
  if (countryStatsEl) countryStatsEl.innerHTML = countryHtml;

  // Show/hide stats panel
  var panel = document.getElementById('stats-panel');
  if (panel) {
    if (visible.length > 0) panel.classList.add('visible');
    else panel.classList.remove('visible');
  }
}

function getFilteredDCs() {
  var query = document.getElementById('search-input').value.toLowerCase();
  return datacenters.filter(function(dc) {
    if (currentFilter !== 'all' && dc.type !== currentFilter) return false;
    if (currentContinent !== 'all' && dc.continent !== currentContinent) return false;
    if (currentCountry && dc.country !== currentCountry) return false;
    if (query) {
      var s = (dc.name + ' ' + dc.operator + ' ' + dc.city + ' ' + (dc.province||'') + ' ' + (dc.country||'') + ' ' + (dc.continent||'') + ' ' + (dc.address||'') + ' ' + (dc.features||[]).join(' ')).toLowerCase();
      return s.indexOf(query) !== -1;
    }
    return true;
  });
}

function updateList() {
  var filtered = getFilteredDCs();
  var query = document.getElementById('search-input').value.toLowerCase();

  // Update list count (keep export button)
  var countEl = document.getElementById('list-count');
  countEl.innerHTML = '共 ' + filtered.length + ' 个数据中心 <a id="export-csv" href="#" class="export-link" title="导出CSV">\ud83d\udce5 导出</a>';
  // Re-bindexport
  document.getElementById('export-csv').addEventListener('click', exportCSV);

  var html = '';
  filtered.forEach(function(dc) {
    var idx = datacenters.indexOf(dc);
    var color = COLOR_MAP[dc.type];
    var tn = TYPE_NAMES[dc.type];
    var tags = '<span class="dc-tag" style="background:'+color+'22;color:'+color+'">'+tn+'</span>';
    if (dc.scale === '\u8d85\u5927\u89c4\u6a21') tags += '<span class="dc-tag hyper">超大规模</span>';
    if (dc.features && dc.features.some(function(f){return f.indexOf('\u7eff\u7535')!==-1||f.indexOf('\u53ef\u518d\u751f')!==-1||f.indexOf('\u98ce\u51b7')!==-1||f.indexOf('\u81ea\u7136\u51b7\u5374')!==-1||f.indexOf('renewable')!==-1;})) tags += '<span class="dc-tag green">绿色</span>';
    if (dc.type === 'ai-computing' || (dc.features && dc.features.some(function(f){return f.indexOf('\u667a\u7b97')!==-1||f.indexOf('AI')!==-1||f.indexOf('GPU')!==-1;}))) tags += '<span class="dc-tag ai">AI</span>';
    if (dc.features && dc.features.some(function(f){return f.indexOf('\u6db2\u51b7')!==-1||f.indexOf('\u6d78\u6ca1')!==-1||f.indexOf('liquid')!==-1;})) tags += '<span class="dc-tag" style="background:rgba(0,188,212,.15);color:#00bcd4">液冷</span>';

    var dcName = dc.name;
    var location = dc.operator + ' · ' + (dc.country||'') + ', ' + dc.city;
    if (query) {
      dcName = highlightText(dcName, query);
      location = highlightText(location, query);
    }
    html += '<div class="dc-item" onclick="selectDC('+idx+')" data-index="'+idx+'"><div class="dc-name">'+dcName+'</div><div class="dc-operator">'+location+'</div><div class="dc-tags">'+tags+'</div></div>';
  });
  document.getElementById('dc-list').innerHTML = html;

  markerCluster.clearLayers();
  allMarkers.forEach(function(m) { if (filtered.indexOf(m.dcData) !== -1) markerCluster.addLayer(m); });
  updateStats();
}

function highlightText(text, query) {
  if (!query) return text;
  var idx = text.toLowerCase().indexOf(query);
  if (idx === -1) return text;
  return text.substring(0, idx) + '<span class="search-highlight">' + text.substring(idx, idx + query.length) + '</span>' + text.substring(idx + query.length);
}

function selectDC(index) {
  var dc = datacenters[index];
  var marker = allMarkers[index];
  map.flyTo([dc.lat, dc.lng], 12, { duration: 1 });
  showDetail(dc, marker);
  document.querySelectorAll('.dc-item').forEach(function(el) { el.classList.remove('active'); });
  var item = document.querySelector('.dc-item[data-index="'+index+'"]');
  if (item) { item.classList.add('active'); item.scrollIntoView({ behavior: 'smooth', block: 'nearest' }); }
}

function showDetail(dc) {
  var panel = document.getElementById('detail-panel');
  var color = COLOR_MAP[dc.type];
  var tn = TYPE_NAMES[dc.type];
  var featHtml = '';
  if (dc.features) {
    featHtml = '<div class="detail-section"><h3>核心特征</h3><div style="display:flex;flex-wrap:wrap;gap:6px">';
    dc.features.forEach(function(f) { featHtml += '<span class="dc-tag" style="padding:4px 10px;font-size:12px">'+f+'</span>'; });
    featHtml += '</div></div>';
  }
  var gUrl = 'https://www.google.com/maps/@'+dc.lat+','+dc.lng+',16z/data=!3m1!1e1';

  // Determine coordinate display
  var latDir = dc.lat >= 0 ? 'N' : 'S';
  var lngDir = dc.lng >= 0 ? 'E' : 'W';

  document.getElementById('detail-content').innerHTML =
    '<div class="detail-header"><h2>'+dc.name+'</h2>' +
    '<span class="operator-badge" style="background:'+color+'22;color:'+color+'"><span style="width:8px;height:8px;border-radius:50%;background:'+color+';display:inline-block"></span> '+dc.operator+' · '+tn+'</span></div>' +
    '<div class="detail-section"><h3>基本信息</h3><div class="detail-grid">' +
    '<div class="detail-field"><div class="label">国家</div><div class="value">'+(dc.country||'')+'</div></div>' +
    '<div class="detail-field"><div class="label">大洲</div><div class="value">'+(dc.continent||'')+'</div></div>' +
    '<div class="detail-field"><div class="label">城市</div><div class="value">'+dc.city+(dc.province ? ', '+dc.province : '')+'</div></div>' +
    '<div class="detail-field"><div class="label">规模</div><div class="value">'+dc.scale+'</div></div>' +
    '<div class="detail-field"><div class="label">服务器/机柜</div><div class="value">'+dc.servers+'</div></div>' +
    '<div class="detail-field"><div class="label">建筑面积</div><div class="value">'+dc.area+'</div></div>' +
    '<div class="detail-field"><div class="label">PUE</div><div class="value">'+dc.pue+'</div></div>' +
    '<div class="detail-field"><div class="label">坐标</div><div class="value">'+Math.abs(dc.lat).toFixed(3)+'\u00b0'+latDir+', '+Math.abs(dc.lng).toFixed(3)+'\u00b0'+lngDir+'</div></div>' +
    (dc.address ? '<div class="detail-field full"><div class="label">地址</div><div class="value">'+dc.address+'</div></div>' : '') +
    '</div></div>' +
    featHtml +
    '<div class="detail-section"><h3>简介</h3><p style="font-size:14px;line-height:1.7;color:#b0b8cc">'+dc.desc+'</p></div>' +
    '<div class="detail-section"><h3>地图视图 \ud83c\udf0d</h3>' +
    (dc.verified ? '<p style="font-size:12px;color:#5a6478;margin-bottom:8px">验证方式: '+dc.verified+'</p>' : '') +
    '<a class="sat-link" href="'+gUrl+'" target="_blank">\ud83c\udf0d Google Earth</a></div>';

  panel.classList.add('open');
}

function closeDetail() { document.getElementById('detail-panel').classList.remove('open'); }

function toggleSidebar() {
  var sb = document.getElementById('sidebar');
  sb.classList.toggle('collapsed');
  var btn = document.getElementById('sidebar-toggle');
  var isMobile = window.innerWidth <= 768;
  if (isMobile) {
    btn.textContent = sb.classList.contains('collapsed') ? '\u25b2' : '\u25bc';
  } else {
    btn.textContent = sb.classList.contains('collapsed') ? '\u25b6' : '\u25c0';
  }
}

function switchMapType(type, btn) {
  map.eachLayer(function(l) { if (l !== markerCluster) map.removeLayer(l); });
  if (type === 'satellite') { satelliteLayer.addTo(map); labelLayer.addTo(map); }
  else if (type === 'standard') { standardLayer.addTo(map); }
  else if (type === 'dark') { darkLayer.addTo(map); }
  document.querySelectorAll('#map-type-switch button').forEach(function(b) { b.classList.remove('active'); });
  btn.classList.add('active');
}

// Event bindings
document.getElementById('search-input').addEventListener('input', function() { updateList(); });

document.getElementById('filter-bar').addEventListener('click', function(e) {
  if (e.target.classList.contains('filter-btn')) {
    document.querySelectorAll('.filter-btn').forEach(function(b) { b.classList.remove('active'); });
    e.target.classList.add('active');
    currentFilter = e.target.getAttribute('data-type');
    updateList();
  }
});

// Continent filter
document.getElementById('continent-bar').addEventListener('click', function(e) {
  if (e.target.classList.contains('continent-btn')) {
    document.querySelectorAll('.continent-btn').forEach(function(b) { b.classList.remove('active'); });
    e.target.classList.add('active');
    currentContinent = e.target.getAttribute('data-continent');
    // Clear country filter when switching continent
    if (currentCountry) clearCountryFilter();
    updateList();
    // Fly to continent view
    var view = CONTINENT_VIEWS[currentContinent];
    if (view) map.flyTo(view.center, view.zoom, { duration: 1.2 });
  }
});

// Country filter
function filterByCountry(name) {
  if (currentCountry === name) { clearCountryFilter(); return; }
  currentCountry = name;
  document.getElementById('cf-name').textContent = name;
  document.getElementById('country-filter').style.display = 'flex';
  updateList();
}

function clearCountryFilter() {
  currentCountry = '';
  document.getElementById('country-filter').style.display = 'none';
  updateList();
}

// CSV export
function exportCSV(e) {
  e.preventDefault();
  var filtered = getFilteredDCs();
  var header = '\ufeff名称,运营商,类型,国家,大洲,省/州,城市,规模,服务器/机柜,面积,PUE,地址,纬度,经度,验证方式,简介\n';
  var rows = filtered.map(function(dc) {
    return [dc.name, dc.operator, TYPE_NAMES[dc.type]||dc.type, dc.country||'', dc.continent||'', dc.province||'', dc.city, dc.scale, dc.servers, dc.area, dc.pue, dc.address||'', dc.lat, dc.lng, dc.verified||'', dc.desc].map(function(v) {
      return '"' + String(v).replace(/"/g, '""') + '"';
    }).join(',');
  }).join('\n');
  var blob = new Blob([header + rows], { type: 'text/csv;charset=utf-8' });
  var url = URL.createObjectURL(blob);
  var a = document.createElement('a');
  a.href = url; a.download = '全球数据中心_' + new Date().toISOString().slice(0,10) + '.csv';
  a.click(); URL.revokeObjectURL(url);
}

// Keyboard shortcuts
document.addEventListener('keydown', function(e) {
  if (e.key === 'Escape') {
    if (document.getElementById('detail-panel').classList.contains('open')) { closeDetail(); return; }
    if (currentCountry) { clearCountryFilter(); return; }
    var si = document.getElementById('search-input');
    if (si.value) { si.value = ''; updateList(); return; }
  }
  if (e.key === '/' && document.activeElement.tagName !== 'INPUT') {
    e.preventDefault();
    document.getElementById('search-input').focus();
  }
});

// Init
initMap();

// ============================================================
// Mobile UX Enhancements
// ============================================================
(function() {
  var isMobile = window.matchMedia('(max-width: 768px)').matches;
  if (!isMobile) return;

  var sidebar = document.getElementById('sidebar');
  var detailPanel = document.getElementById('detail-panel');

  // 1. 默认收起侧边栏
  sidebar.classList.add('collapsed');

  // 2. 创建遮罩层
  var mask = document.createElement('div');
  mask.className = 'mobile-mask';
  document.body.appendChild(mask);

  function expandSidebar() {
    sidebar.classList.add('mobile-expanded');
    sidebar.classList.remove('collapsed');
    mask.classList.add('active');
  }
  function collapseSidebar() {
    sidebar.classList.remove('mobile-expanded');
    sidebar.classList.add('collapsed');
    mask.classList.remove('active');
  }

  mask.addEventListener('click', collapseSidebar);

  // 3. 点击 sidebar 顶部手柄区域 / 搜索框触发展开
  sidebar.addEventListener('click', function(e) {
    // 如果已展开，点击手柄区（顶部20px）收起
    var rect = sidebar.getBoundingClientRect();
    var clickY = e.clientY - rect.top;
    if (sidebar.classList.contains('mobile-expanded') && clickY < 20) {
      collapseSidebar();
      e.stopPropagation();
      return;
    }
    // 未展开时，点击任何地方都展开
    if (!sidebar.classList.contains('mobile-expanded')) {
      expandSidebar();
    }
  });

  // 4. 触摸拖拽支持
  var startY = 0, currentY = 0, dragging = false;
  sidebar.addEventListener('touchstart', function(e) {
    startY = e.touches[0].clientY;
    currentY = startY;
    dragging = true;
  }, { passive: true });

  sidebar.addEventListener('touchmove', function(e) {
    if (!dragging) return;
    currentY = e.touches[0].clientY;
  }, { passive: true });

  sidebar.addEventListener('touchend', function() {
    if (!dragging) return;
    var delta = currentY - startY;
    // 向下拖 > 50px 收起；向上拖 > 50px 展开
    if (delta > 50 && sidebar.classList.contains('mobile-expanded')) {
      collapseSidebar();
    } else if (delta < -50 && !sidebar.classList.contains('mobile-expanded')) {
      expandSidebar();
    }
    dragging = false;
  });

  // 5. 点击列表项后自动收起侧边栏（让用户看地图）
  var dcList = document.getElementById('dc-list');
  dcList.addEventListener('click', function(e) {
    var item = e.target.closest('.dc-item');
    if (item) {
      setTimeout(collapseSidebar, 150);
    }
  });

  // 6. 详情面板支持向下滑动关闭
  var dStartY = 0, dCurrentY = 0, dDragging = false;
  detailPanel.addEventListener('touchstart', function(e) {
    // 只在顶部 60px 区域响应拖动（避免影响内容滚动）
    var rect = detailPanel.getBoundingClientRect();
    var touchY = e.touches[0].clientY - rect.top;
    if (touchY < 60) {
      dStartY = e.touches[0].clientY;
      dCurrentY = dStartY;
      dDragging = true;
    }
  }, { passive: true });

  detailPanel.addEventListener('touchmove', function(e) {
    if (!dDragging) return;
    dCurrentY = e.touches[0].clientY;
  }, { passive: true });

  detailPanel.addEventListener('touchend', function() {
    if (!dDragging) return;
    var delta = dCurrentY - dStartY;
    if (delta > 80) closeDetail();
    dDragging = false;
  });

  // 7. 展开侧边栏时，统计面板默认展开
  var statsPanel = document.getElementById('stats-panel');
  if (statsPanel) statsPanel.classList.add('visible');
})();
