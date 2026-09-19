(function () {
  // ---------- Elements ----------
  const categorySelect = document.getElementById('categorySelect');
  const categoryMeta = document.getElementById('categoryMeta');
  const dropzone = document.getElementById('dropzone');
  const fileInput = document.getElementById('fileInput');
  const previewArea = document.getElementById('previewArea');
  const previewGrid = document.getElementById('previewGrid');
  const replaceBtn = document.getElementById('replaceBtn');
  const scanBtn = document.getElementById('scanBtn');
  const statusArea = document.getElementById('statusArea');
  const statusText = document.getElementById('statusText');
  const barFill = document.getElementById('barFill');
  const errorArea = document.getElementById('errorArea');
  const resultsPanel = document.getElementById('resultsPanel');
  const verdictEl = document.getElementById('verdict');
  const verdictLabel = document.getElementById('verdictLabel');
  const verdictSub = document.getElementById('verdictSub');
  const fieldListAuto = document.getElementById('fieldListAuto');
  const fieldListManual = document.getElementById('fieldListManual');
  const manualFieldsWrap = document.getElementById('manualFieldsWrap');
  const rawText = document.getElementById('rawText');

  // ---------- State ----------
  let ruleDb = null;
  let selectedCategory = null;
  let currentFiles = []; // array of File objects — treated as panels of one package
  let worker = null;
  let workerReady = false;
  let workerFailed = false;

  // ---------- Load the rule database (separate from this code) ----------
  async function loadRules() {
    try {
      const res = await fetch('rules.json');
      if (!res.ok) throw new Error('HTTP ' + res.status);
      ruleDb = await res.json();
      populateCategories();
    } catch (err) {
      console.error('Failed to load rules.json', err);
      categorySelect.innerHTML = '<option value="" disabled selected>Failed to load rules.json</option>';
      showError('Could not load rules.json. If you opened this file directly (file://), serve it with a local web server instead (e.g. <code>python3 -m http.server</code>) — browsers block fetch() of local JSON files opened directly.');
    }
  }

  function populateCategories() {
    categorySelect.innerHTML = '<option value="" disabled selected>Select a product category…</option>';
    ruleDb.categories.forEach(cat => {
      const opt = document.createElement('option');
      opt.value = cat.id;
      opt.textContent = cat.label;
      categorySelect.appendChild(opt);
    });
  }

  categorySelect.addEventListener('change', () => {
    selectedCategory = ruleDb.categories.find(c => c.id === categorySelect.value) || null;
    if (selectedCategory) {
      categoryMeta.classList.remove('hidden');
      categoryMeta.innerHTML = 'Expected quantity type: <span class="unit-tag">' + selectedCategory.quantityUnit + '</span>';
    }
    updateScanButtonState();
    resultsPanel.classList.add('hidden');
  });

  loadRules();

  // ---------- OCR worker (pre-warmed in background) ----------
  async function initWorker() {
    try {
      if (typeof Tesseract === 'undefined') throw new Error('Tesseract library did not load.');
      worker = await Tesseract.createWorker('eng', 1, {
        logger: (m) => {
          if (m.status && typeof m.progress === 'number') updateProgress(m.status, m.progress);
        }
      });
      workerReady = true;
    } catch (err) {
      workerFailed = true;
      console.error('OCR init failed', err);
    }
  }
  initWorker();

  // ---------- Upload handling ----------
  dropzone.addEventListener('click', () => fileInput.click());
  replaceBtn.addEventListener('click', (e) => { e.stopPropagation(); fileInput.click(); });

  ['dragover', 'dragenter'].forEach(evt => {
    dropzone.addEventListener(evt, (e) => { e.preventDefault(); dropzone.classList.add('dragover'); });
  });
  ['dragleave', 'drop'].forEach(evt => {
    dropzone.addEventListener(evt, (e) => { e.preventDefault(); dropzone.classList.remove('dragover'); });
  });
  dropzone.addEventListener('drop', (e) => {
    addFiles(e.dataTransfer.files);
  });
  fileInput.addEventListener('change', (e) => {
    addFiles(e.target.files);
    fileInput.value = ''; // allow re-adding the same file / picking again
  });

  function addFiles(fileList) {
    const files = Array.from(fileList || []);
    const images = files.filter(f => f.type.startsWith('image/'));
    if (images.length !== files.length) {
      showError("Some of those weren't images and were skipped. Please upload JPG or PNG photos only.");
    } else {
      clearError();
    }
    if (!images.length) return;
    currentFiles = currentFiles.concat(images);
    renderThumbnails();
    previewArea.classList.remove('hidden');
    resultsPanel.classList.add('hidden');
    statusArea.classList.add('hidden');
    updateScanButtonState();
  }

  function removeFile(index) {
    currentFiles.splice(index, 1);
    renderThumbnails();
    updateScanButtonState();
    if (!currentFiles.length) previewArea.classList.add('hidden');
  }

  function renderThumbnails() {
    previewGrid.innerHTML = '';
    currentFiles.forEach((file, i) => {
      const thumb = document.createElement('div');
      thumb.className = 'thumb';
      const img = document.createElement('img');
      img.src = URL.createObjectURL(file);
      img.alt = file.name;
      const label = document.createElement('div');
      label.className = 'thumb-label';
      label.textContent = 'Panel ' + (i + 1);
      const removeBtn = document.createElement('button');
      removeBtn.className = 'thumb-remove';
      removeBtn.textContent = '×';
      removeBtn.title = 'Remove this photo';
      removeBtn.addEventListener('click', (e) => { e.stopPropagation(); removeFile(i); });
      thumb.appendChild(img);
      thumb.appendChild(label);
      thumb.appendChild(removeBtn);
      previewGrid.appendChild(thumb);
    });
  }

  function updateScanButtonState() {
    if (!selectedCategory) {
      scanBtn.disabled = true;
      scanBtn.textContent = 'Select a category first';
    } else if (!currentFiles.length) {
      scanBtn.disabled = true;
      scanBtn.textContent = 'Upload at least one image first';
    } else {
      scanBtn.disabled = false;
      scanBtn.textContent = currentFiles.length > 1
        ? 'Scan ' + currentFiles.length + ' photos'
        : 'Scan label';
    }
  }

  scanBtn.addEventListener('click', runScan);

  function updateProgress(status, progress) {
    const pct = Math.round(progress * 100);
    barFill.style.width = pct + '%';
    const labels = {
      'loading tesseract core': 'Loading OCR engine…',
      'initializing tesseract': 'Initializing OCR engine…',
      'loading language traineddata': 'Downloading language data…',
      'initializing api': 'Preparing scanner…',
      'recognizing text': 'Reading label text…'
    };
    statusText.textContent = labels[status] || status;
  }

  function showError(html) {
    errorArea.classList.remove('hidden');
    errorArea.innerHTML = '<div class="error-box">' + html + '</div>';
  }
  function clearError() {
    errorArea.classList.add('hidden');
    errorArea.innerHTML = '';
  }

  // ---------- Image normalization ----------
  // Phone photos carry an EXIF orientation flag rather than physically
  // rotated pixels. Browsers are inconsistent about honoring that flag when
  // handing raw image bytes to something like Tesseract (as opposed to
  // rendering it in an <img> tag), so the same photo can OCR fine in one
  // browser and come out sideways/garbled in another. Fixing orientation
  // ourselves, once, removes that inconsistency. We also upscale small
  // images slightly since Tesseract accuracy drops on low-resolution input.
  async function normalizeImage(file) {
    try {
      const bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' });
      const maxDim = Math.max(bitmap.width, bitmap.height);
      const scale = maxDim < 1200 ? 1200 / maxDim : 1;
      const canvas = document.createElement('canvas');
      canvas.width = Math.round(bitmap.width * scale);
      canvas.height = Math.round(bitmap.height * scale);
      const ctx = canvas.getContext('2d');
      ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
      const blob = await new Promise(resolve => canvas.toBlob(resolve, 'image/png'));
      return blob || file;
    } catch (err) {
      console.warn('Image normalization failed, using original file as-is', err);
      return file;
    }
  }

  async function runScan() {
    if (!currentFiles.length || !selectedCategory) return;
    clearError();
    resultsPanel.classList.add('hidden');
    statusArea.classList.remove('hidden');
    scanBtn.disabled = true;
    barFill.style.width = '5%';
    statusText.textContent = 'Loading OCR engine…';

    const waitStart = Date.now();
    while (!workerReady && !workerFailed) {
      if (Date.now() - waitStart > 30000) { workerFailed = true; break; }
      await new Promise(r => setTimeout(r, 200));
    }

    if (workerFailed || !worker) {
      statusArea.classList.add('hidden');
      updateScanButtonState();
      showError("The OCR engine couldn't load (likely a network/CDN restriction in this environment). Try reloading, or open index.html via a local web server instead of a restricted preview.");
      return;
    }

    try {
      const texts = [];
      const confidences = [];
      for (let i = 0; i < currentFiles.length; i++) {
        statusText.textContent = 'Reading panel ' + (i + 1) + ' of ' + currentFiles.length + '…';
        barFill.style.width = Math.round(((i) / currentFiles.length) * 100) + '%';
        const normalized = await normalizeImage(currentFiles[i]);
        const { data } = await worker.recognize(normalized);
        texts.push('--- Panel ' + (i + 1) + ' (' + currentFiles[i].name + ') ---\n' + (data.text || '').trim());
        confidences.push(data.confidence || 0);
      }
      barFill.style.width = '100%';
      const combinedText = texts.join('\n\n');
      const avgConfidence = confidences.reduce((a, b) => a + b, 0) / confidences.length;
      renderResults(combinedText, avgConfidence);
    } catch (err) {
      console.error(err);
      showError('Something went wrong reading these images: ' + (err.message || err) + '. Try clearer, well-lit photos.');
    } finally {
      statusArea.classList.add('hidden');
      updateScanButtonState();
    }
  }

  // ---------- Field extraction (regex heuristics over OCR text) ----------
  // Real labels rarely lay information out linearly — a legend/keyword can
  // sit far from its actual value (e.g. "MRP (Incl. of all taxes)" printed
  // as a legend, with the real price only appearing later in a separate
  // batch-code box). So keyword presence and value presence are checked
  // independently rather than requiring them to be close together.
  function extractFields(text) {
    const t = text.replace(/\r/g, '');
    const out = {};

    const qtyMatch = t.match(/(\d+(?:[.,]\d+)?)\s?(ml|mL|l|L|kg|Kg|KG|g|G|gm|gms|grams?|pieces?|pcs|pairs?)\b/);
    out.netQuantity = qtyMatch ? (qtyMatch[1] + ' ' + qtyMatch[2]) : null;

    // MRP: a currency-prefixed amount anywhere on the label is sufficient
    // proof it's declared — don't require it to sit right next to "MRP".
    let mrpMatch = t.match(/(?:₹|rs\.?|inr)\s?([\d,]+(?:\.\d{1,2})?)/i);
    if (!mrpMatch) {
      // Fallback: "MRP" keyword followed by a number within a generous window.
      mrpMatch = t.match(/mrp[\s\S]{0,60}?([\d,]+(?:\.\d{1,2})?)/i);
    }
    out.mrp = mrpMatch ? mrpMatch[1] : null;

    // Manufacturer / packer / marketer — include common abbreviations
    // ("Mfd. by", "Mfg. by") seen on real Indian packaging, not just the
    // spelled-out "manufactured by".
    out.manufacturer = /(manufactured by|manufacturer|packed by|packer|marketed by|mktd by|mfg\.?\s*by|mfd\.?\s*by)/i.test(t);

    const phoneMatch = t.match(/\b\d{10}\b|\b\d{3,4}[-\s]\d{6,7}\b/);
    const emailMatch = /[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}/i.test(t);
    out.consumerCare = /(consumer care|customer care|toll[- ]?free|helpline|query|feedback)/i.test(t) || !!phoneMatch || emailMatch;

    // Dates: accept a full DD/MM/YYYY date, OR the compact MM/YY-style
    // codes common on cosmetics batch boxes ("M 05/26", "U 10/28" for
    // manufacture/use-before), OR an explicit keyword nearby a value.
    const fullDate = /\b\d{1,2}[\/\-.]\d{1,2}[\/\-.]\d{2,4}\b/.test(t);
    const shortCode = /\b[MU]\s?\d{1,2}\/\d{2,4}\b/i.test(t);
    const keywordDate = /(mfg|exp|best before|use by|use before)[^\n]{0,40}/i.test(t);
    out.dates = fullDate || shortCode || keywordDate;

    const sizeMatch = t.match(/\b(XXS|XS|S|M|L|XL|XXL|XXXL)\b/) || t.match(/size[:\s]*([0-9]{1,2})/i);
    out.size = sizeMatch ? sizeMatch[0] : null;

    return out;
  }

  function renderResults(rawTextValue, confidence) {
    rawText.textContent = rawTextValue.trim() || '(no text detected)';
    const wordCount = (rawTextValue.match(/\S+/g) || []).length;
    const extracted = extractFields(rawTextValue);

    const autoResultsMap = {
      netQuantity: { found: !!extracted.netQuantity, value: extracted.netQuantity },
      mrp: { found: !!extracted.mrp, value: extracted.mrp ? ('₹' + extracted.mrp) : null },
      manufacturer: { found: extracted.manufacturer, value: extracted.manufacturer ? 'Detected' : null },
      dates: { found: extracted.dates, value: extracted.dates ? 'Detected' : null },
      consumerCare: { found: extracted.consumerCare, value: extracted.consumerCare ? 'Detected' : null },
      size: { found: !!extracted.size, value: extracted.size }
    };

    const requiredFields = selectedCategory.requiredFields;
    const autoRows = [];
    const manualRows = [];

    requiredFields.forEach(key => {
      const def = ruleDb.fieldDefinitions[key];
      if (!def) return;
      if (def.autoCheckable) {
        const r = autoResultsMap[key] || { found: false, value: null };
        autoRows.push({ name: def.label, found: r.found, value: r.value || 'Not detected' });
      } else {
        manualRows.push({ name: def.label });
      }
    });

    fieldListAuto.innerHTML = '';
    autoRows.forEach(f => {
      const row = document.createElement('div');
      row.className = 'field-row ' + (f.found ? 'found' : 'missing');
      row.innerHTML = '<span class="fname">' + f.name + '</span><span class="fval">' + f.value + '</span>';
      fieldListAuto.appendChild(row);
    });

    if (manualRows.length) {
      manualFieldsWrap.classList.remove('hidden');
      fieldListManual.innerHTML = '';
      manualRows.forEach(f => {
        const row = document.createElement('div');
        row.className = 'field-row';
        row.innerHTML = '<span class="fname">' + f.name + '</span><span class="fval">Verify manually</span>';
        fieldListManual.appendChild(row);
      });
    } else {
      manualFieldsWrap.classList.add('hidden');
    }

    let verdict, verdictText, sub;
    const lowSignal = wordCount < 12 || confidence < 45;
    const missingAuto = autoRows.filter(f => !f.found);

    if (lowSignal) {
      verdict = 'review';
      verdictText = 'REVIEW REQUIRED';
      sub = 'Label text is too unclear or sparse to verify automatically — send for human review.';
    } else if (missingAuto.length === 0) {
      verdict = 'pass';
      verdictText = 'PASS';
      sub = manualRows.length
        ? 'All auto-checkable declarations were found. ' + manualRows.length + ' field(s) still need manual verification.'
        : 'All required declarations for ' + selectedCategory.label + ' were detected.';
    } else {
      verdict = 'fail';
      verdictText = 'FAIL';
      sub = 'Missing for ' + selectedCategory.label + ': ' + missingAuto.map(f => f.name).join(', ') + '.';
    }

    verdictEl.className = 'verdict ' + verdict;
    verdictLabel.textContent = verdictText;
    verdictSub.textContent = sub;

    resultsPanel.classList.remove('hidden');
    resultsPanel.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }
})();
