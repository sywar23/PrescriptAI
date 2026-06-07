document.addEventListener('DOMContentLoaded', () => {
    const API_BASE = "http://localhost:8000/api";

    // ---- ELEMENTS ----
    const statsGrid = document.getElementById('stats-grid-container');
    const tabBtns = document.querySelectorAll('.tab-btn');
    const tabContents = document.querySelectorAll('.tab-content');

    // ---- NAVIGATION TABS ----
    if (tabBtns) {
        tabBtns.forEach(btn => {
            btn.addEventListener('click', () => {
                tabBtns.forEach(b => b.classList.remove('active'));
                tabContents.forEach(c => c.classList.add('hidden'));

                btn.classList.add('active');
                const targetId = btn.getAttribute('data-tab');
                const contentPanel = document.getElementById(targetId);
                if (contentPanel) contentPanel.classList.remove('hidden');

                if (targetId === 'tab-history') fetchHistory();
            });
        });
    }

    const prescriptionText = document.getElementById('prescription-text');
    const pdfInput = document.getElementById('pdf-input');
    const pdfPreview = document.getElementById('pdf-preview');
    const pdfNameSpan = document.getElementById('pdf-name');
    const statusDot = document.getElementById('status-dot');
    const statusText = document.getElementById('status-text');

    const analysisResults = document.getElementById('analysis-results');
    const actionsContainer = document.getElementById('actions-container');
    const quickDrugsList = document.getElementById('quick-drugs-list');
    const dosageList = document.getElementById('dosage-list');
    const interactionsContainer = document.getElementById('interaction-alerts');
    const interactionsList = document.getElementById('interactions-list');
    const dangerContainer = document.getElementById('danger-alerts');
    const ciList = document.getElementById('ci-list') || document.getElementById('contra-list');
    const analyzeBtn = document.getElementById('analyze-btn-main');
    const clinicalDetails = document.getElementById('clinical-analysis-details');

    // ---- ADVANCED UPLOAD & DRAG-DROP ----
    const dropZone = document.getElementById('drop-zone');
    const uploadBox = document.querySelector('.upload-box');

    console.log("🔍 Elements Check:", {
        dropZone: !!dropZone,
        uploadBox: !!uploadBox,
        pdfInput: !!pdfInput,
        pdfPreview: !!pdfPreview
    });

    if (dropZone && pdfInput) {
        console.log("✅ PDF Listeners are being attached...");

        ['dragenter', 'dragover', 'dragleave', 'drop'].forEach(eventName => {
            dropZone.addEventListener(eventName, (e) => {
                e.preventDefault();
                e.stopPropagation();
            }, false);
        });

        ['dragenter', 'dragover'].forEach(eventName => {
            dropZone.addEventListener(eventName, () => {
                dropZone.classList.add('dragover');
            }, false);
        });

        ['dragleave', 'drop'].forEach(eventName => {
            dropZone.addEventListener(eventName, () => {
                dropZone.classList.remove('dragover');
            }, false);
        });

        dropZone.addEventListener('drop', (e) => {
            console.log("📥 File dropped!");
            const dt = e.dataTransfer;
            if (dt && dt.files && dt.files.length > 0) {
                handleFiles(dt.files);
            }
        }, false);

        dropZone.addEventListener('click', (e) => {
            console.log("🖱️ DropZone clicked");
            if (e.target.classList.contains('browse-text')) {
                console.log("🔗 Browse text clicked - letting HTML handle it");
                return;
            }
            pdfInput.click();
        });

        pdfInput.addEventListener('change', (e) => {
            console.log("📁 File input changed!");
            if (e.target.files && e.target.files.length > 0) {
                handleFiles(e.target.files);
            }
        });
    }

    async function handleFiles(files) {
        const file = files[0];
        console.log("📄 Handling file:", file ? file.name : "None");

        if (!file || file.type !== 'application/pdf') {
            alert("Veuillez sélectionner un fichier PDF valide.");
            return;
        }

        // UI Feedback
        if (uploadBox) uploadBox.classList.add('hidden');
        if (pdfNameSpan) pdfNameSpan.innerText = file.name;
        if (pdfPreview) pdfPreview.classList.remove('hidden');

        const formData = new FormData();
        formData.append('file', file);

        console.log("📡 Sending to backend...");
        try {
            const r = await fetch(`${API_BASE}/extract`, {
                method: 'POST',
                body: formData
            });
            console.log("📡 Response Status:", r.status);

            if (!r.ok) throw new Error("Erreur serveur: " + r.status);

            const d = await r.json();
            console.log("✅ Data received:", d);

            if (d.text && prescriptionText) {
                prescriptionText.value = d.text;
                console.log("📝 Text injected into textarea");
                triggerAutoExtraction();
            }
        } catch (err) {
            console.error("❌ PDF Extraction Error:", err);
            if (uploadBox) uploadBox.classList.remove('hidden');
            if (pdfPreview) pdfPreview.classList.add('hidden');
            alert("Erreur: " + err.message);
        }
    }

    // ---- ANALYSIS TABS SWITCHING ----
    const analysisTabs = document.querySelectorAll('.analysis-tab');
    const tabSecs = document.querySelectorAll('.tab-sec');

    analysisTabs.forEach(tab => {
        tab.addEventListener('click', () => {
            analysisTabs.forEach(t => t.classList.remove('active'));
            tabSecs.forEach(s => s.classList.add('hidden'));

            tab.classList.add('active');
            const target = tab.getAttribute('data-sec');
            const sec = document.getElementById(target);
            if (sec) sec.classList.remove('hidden');

            if (statsGrid) {
                if (target === 'sec-interactions' && statsGrid.dataset.loaded === 'true') {
                    statsGrid.style.setProperty('display', 'grid', 'important');
                } else {
                    statsGrid.style.setProperty('display', 'none', 'important');
                }
            }
        });
    });

    // ---- AUTO DRUG EXTRACTION & FULL ANALYSIS ----
    let tTimer;
    if (prescriptionText) {
        prescriptionText.addEventListener('input', () => {
            clearTimeout(tTimer);
            tTimer = setTimeout(triggerAutoExtraction, 1000);
        });
    }

    async function triggerAutoExtraction() {
        const text = prescriptionText.value.trim();
        if (text.length < 5) {
            analysisResults.classList.add('hidden');
            actionsContainer.classList.add('hidden');
            clinicalDetails.classList.add('hidden');
            return;
        }

        analysisResults.classList.remove('hidden');
        actionsContainer.classList.remove('hidden');

        // Block Analyze Button and show busy state
        if (analyzeBtn) {
            analyzeBtn.disabled = true;
            analyzeBtn.style.opacity = '0.5';
            analyzeBtn.style.cursor = 'not-allowed';
            analyzeBtn.title = "Identification en cours...";
        }

        quickDrugsList.innerHTML = '<span style="color:#0ea5e9; font-size:0.75rem; font-style:italic; display:flex; align-items:center; gap:8px;"><i class="fa-solid fa-sync fa-spin"></i> Identification des composants...</span>';

        try {
            const r1 = await fetch(`${API_BASE}/extract_drugs`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ text })
            });
            const d1 = await r1.json();

            quickDrugsList.innerHTML = '';
            const drugCount = d1.drugs?.length || 0;
            const medsStat = document.getElementById('count-meds-stat');
            if (medsStat) medsStat.innerText = drugCount;

            if (drugCount > 0) {
                d1.drugs.forEach(drug => {
                    const b = document.createElement('span');
                    b.style.cssText = `padding: 6px 16px; background: white; border: 2px solid #0ea5e9; border-radius: 50px; font-size: 0.8rem; font-weight: 800; color: #1e3a8a; display: flex; align-items: center; gap: 8px; box-shadow: 0 4px 12px rgba(14,165,233,0.15); animation: fadeInUp 0.4s ease-out;`;
                    let name = typeof drug === 'string' ? drug : (drug.display_name || drug.name || "Médicament");
                    b.innerHTML = `<i class="fa-solid fa-pills" style="color:#0ea5e9;"></i> ${name}`;
                    quickDrugsList.appendChild(b);
                });

                // Full analysis is now ONLY triggered manually by the user
            } else {
                quickDrugsList.innerHTML = '<span style="color:#64748b; font-size:0.8rem; opacity:0.7;">Aucun médicament détecté dans le texte.</span>';
                clinicalDetails.classList.add('hidden');
            }
        } catch (e) {
            console.error(e);
        } finally {
            // Re-enable Analyze Button
            if (analyzeBtn) {
                analyzeBtn.disabled = false;
                analyzeBtn.style.opacity = '1';
                analyzeBtn.style.cursor = 'pointer';
                analyzeBtn.title = "";
            }
        }
    }

    if (analyzeBtn) analyzeBtn.addEventListener('click', performFullAnalysis);

    // Global storage for last analysis result (for PDF report)
    let lastAnalysisData = null;

    async function performFullAnalysis() {
        const text = prescriptionText.value.trim();
        if (text.length < 5) return;

        if (analyzeBtn) {
            analyzeBtn.disabled = true;
            analyzeBtn.innerHTML = '<i class="fa-solid fa-sync fa-spin"></i> Analyse IA...';
            analyzeBtn.style.background = '#94a3b8';
        }

        if (clinicalDetails) {
            clinicalDetails.classList.remove('hidden');
            clinicalDetails.style.opacity = '0.5';
            clinicalDetails.style.pointerEvents = 'none';
            clinicalDetails.style.transition = 'opacity 0.3s ease';
        }

        if (statsGrid) {
            statsGrid.style.setProperty('display', 'none', 'important');
            statsGrid.dataset.loaded = 'false';
        }

        if (dosageList) dosageList.innerHTML = '<div class="loader-placeholder"><i class="fa-solid fa-dna fa-spin"></i><span>Calcul des posologies optimales...</span></div>';
        if (interactionsList) interactionsList.innerHTML = '<div class="loader-placeholder"><i class="fa-solid fa-shield-virus fa-spin"></i><span>Scan des interactions médicamenteuses...</span></div>';
        if (ciList) ciList.innerHTML = '<div class="loader-placeholder"><i class="fa-solid fa-stethoscope fa-spin"></i><span>Analyse des contre-indications cliniques...</span></div>';

        const chartContainer = document.getElementById('interactions-chart-container');
        if (chartContainer) chartContainer.classList.add('hidden');

        try {
            const startTime = Date.now();
            const r = await fetch(`${API_BASE}/analyze`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ text, lang: 'fr' })
            });
            const d = await r.json();
            const duration = ((Date.now() - startTime) / 1000).toFixed(1);

            const timeStat = document.getElementById('analysis-time');
            if (timeStat) timeStat.innerText = duration + 's';

            if (d.success) {
                lastAnalysisData = d;
                // Show the Dossier Patient button
                const dossierBtn2 = document.getElementById('btn-patient-dossier');
                if (dossierBtn2) {
                    dossierBtn2.style.display = 'flex';
                }
                // Clear all loaders
                if (interactionsList) interactionsList.innerHTML = '';
                if (dosageList) dosageList.innerHTML = '';
                if (ciList) ciList.innerHTML = '';

                // Show Stats after success ONLY if we are in Interactions tab
                const activeTab = document.querySelector('.analysis-tab.active');
                const activeTabSec = activeTab ? activeTab.getAttribute('data-sec') : 'sec-interactions';
                if (statsGrid) {
                    statsGrid.dataset.loaded = 'true';
                    if (activeTabSec === 'sec-interactions') {
                        statsGrid.style.setProperty('display', 'grid', 'important');
                    } else {
                        statsGrid.style.setProperty('display', 'none', 'important');
                    }
                }

                // Update Médicaments Stat
                const n = d.drugs?.length || 0;
                const medsStat = document.getElementById('count-meds-stat');
                if (medsStat) medsStat.innerText = n;

                // Calculation of combinations (Pairs)
                const combinationsCount = (n * (n - 1)) / 2;
                const interStat = document.getElementById('count-inters');
                if (interStat) interStat.innerText = Math.max(0, combinationsCount);

                // Dosage
                const dosageData = d.dosage || [];
                const dosageTableBody = document.getElementById('dosage-table-body');
                const dosageChartContainer = document.getElementById('dosage-chart-container');

                if (dosageTableBody) {
                    if (dosageData.length > 0) {
                        dosageTableBody.innerHTML = dosageData.map(dos => {
                            let typeClass = 'aucun';
                            if (dos.type === 'Approprié') typeClass = 'approprie';
                            else if (dos.type === 'Sur-dosage') typeClass = 'inapproprie';
                            else if (dos.type === 'Sous-dosage') typeClass = 'info';

                            const riskFactor = dos['facteur de risque'] === 'N/A' ? 'Aucun risque identifié' : dos['facteur de risque'];
                            const sourceHtml = `<i class="fa-solid fa-file-shield" style="margin-right:4px;"></i>${dos.source}`;
                            return `
                            <tr>
                                <td><span class="badge-med-modern">${dos.médicament}</span></td>
                                <td><span class="sev-badge ${typeClass}">${dos.type}</span></td>
                                <td style="font-size:0.85rem; font-weight:600;">${dos['dose prescrite']}</td>
                                <td style="font-size:0.85rem; color:#059669; font-weight:600;">${dos['dose recommandée']}</td>
                                <td style="font-size:0.8rem; color:#475569;">${riskFactor}</td>
                                <td style="font-size:0.85rem; line-height:1.5;">${dos.explication}</td>
                                <td style="font-size:0.75rem; color:#2563eb; font-weight:600;">${sourceHtml}</td>
                            </tr>`;
                        }).join('');

                        // Update Mini Stats
                        document.getElementById('dos-total').innerText = dosageData.length;
                        document.getElementById('dos-sur').innerText = dosageData.filter(x => x.type === 'Sur-dosage').length;

                        document.getElementById('dos-sous').innerText = dosageData.filter(x => x.type === 'Sous-dosage').length;
                        document.getElementById('dos-appr').innerText = dosageData.filter(x => x.type === 'Approprié').length;

                        if (dosageChartContainer) {
                            dosageChartContainer.classList.remove('hidden');
                            updateDosageChart(dosageData);
                        }
                    } else {
                        dosageTableBody.innerHTML = '<tr><td colspan="7" style="text-align:center; padding:40px; color:#94a3b8;">Aucune analyse de dosage disponible.</td></tr>';
                    }
                }

                // Interactions Table & Chart
                const inters = d.interactions || [];
                const tableBody = document.getElementById('interactions-table-body');

                if (inters.length > 0) {
                    interactionsContainer.classList.remove('hidden');

                    document.getElementById('inter-placeholder').classList.add('hidden');

                    if (tableBody) {
                        tableBody.innerHTML = inters.map(inter => `
                            <tr>
                                <td><span class="badge-med-modern">${inter.drug_a}</span></td>
                                <td><span class="badge-med-modern">${inter.drug_b}</span></td>
                                <td><span class="sev-badge ${inter.severity.toLowerCase()}">${inter.severity}</span></td>
                                <td style="font-size: 0.9rem; color: #334155; line-height: 1.6;">${inter.explanation}</td>
                                <td>
                                    <span class="source-chip ${inter.source === 'Aucun' ? 'none' : ''}">
                                        <i class="fa-solid ${inter.source === 'Aucun' ? 'fa-circle-info' : 'fa-file-medical'}"></i>
                                        ${inter.source}
                                    </span>
                                </td>
                            </tr>`).join('');
                    }

                    if (chartContainer) {
                        chartContainer.classList.remove('hidden');
                        updateInteractionsChart(inters);
                    }
                } else {
                    interactionsContainer.classList.add('hidden');
                    document.getElementById('inter-placeholder').classList.remove('hidden');
                    if (chartContainer) chartContainer.classList.add('hidden');
                }

                // Contre-indications
                const ciData = d.contraindications || [];
                const ciTableBody = document.getElementById('ci-table-body');
                const ciCounter = document.getElementById('count-major-ci');

                if (ciTableBody) {
                    if (ciData.length > 0) {
                        ciTableBody.innerHTML = ciData.map(ci => `
                            <tr>
                                <td><span class="badge-med-modern" style="background:#fff1f2; color:#be123c; border-color:#fecdd3;">${ci.médicament}</span></td>
                                <td style="font-size:0.9rem; color:#475569; font-weight:600; line-height:1.6;">${ci.raison}</td>
                                <td><span class="sev-badge ${ci.gravité === 'MAJEUR' || ci.gravité === 'ÉLEVÉE' ? 'majeur' : ci.gravité.toLowerCase()}">${ci.gravité}</span></td>
                                <td>
                                    <span class="source-chip">
                                        <i class="fa-solid fa-book-medical"></i>
                                        ${ci.source || 'Protocole Standard'}
                                    </span>
                                </td>
                            </tr>`).join('');

                        if (ciCounter) ciCounter.innerText = ciData.length;
                    } else {
                        ciTableBody.innerHTML = '<tr><td colspan="4" style="text-align:center; padding:40px; color:#94a3b8;">Aucune contre-indication clinique détectée.</td></tr>';
                        if (ciCounter) ciCounter.innerText = '0';
                    }
                }
            }
        } catch (e) {
            console.error(e);
        } finally {
            if (analyzeBtn) {
                analyzeBtn.disabled = false;
                analyzeBtn.innerHTML = '<i class="fa-solid fa-microscope"></i> Analyser la Prescription';
                analyzeBtn.style.background = '#2563eb';
            }
            if (clinicalDetails) {
                clinicalDetails.style.opacity = '1';
                clinicalDetails.style.pointerEvents = 'auto';
            }
        }
    }

    function getSeverityColor(sev) {
        if (sev === 'MAJEUR') return '#ef4444';
        if (sev === 'MODÉRÉ') return '#f97316';
        if (sev === 'MINEUR') return '#eab308';
        return '#94a3b8';
    }

    function getSeverityBg(sev) {
        if (sev === 'MAJEUR') return '#fef2f2';
        if (sev === 'MODÉRÉ') return '#fff7ed';
        if (sev === 'MINEUR') return '#fefce8';
        return '#f8fafc';
    }

    let dosageChartInstance = null;
    let interactionsChartInstance = null;

    // ---- DOSSIER PATIENT MODAL ----
    const dossierBtn = document.getElementById('btn-patient-dossier');
    const dossierModal = document.getElementById('dossier-modal');
    const dossierModalBody = document.getElementById('dossier-modal-body');
    const closeDossierModal = document.getElementById('close-dossier-modal');
    const closeDossierBtn = document.getElementById('close-dossier-btn');
    const downloadDossierBtn = document.getElementById('download-dossier-btn');

    function openDossierModal() {
        if (!lastAnalysisData) return;
        const data = lastAnalysisData;
        const patient = data.patient_profile || {};
        const patientName = patient.nom || patient.name || 'Inconnu';
        const patientAge = patient.age || patient.âge || 'N/A';

        const modalTitle = dossierModal.querySelector('.modal-title-box h3');
        if (modalTitle) modalTitle.innerText = "Dossier Patient";

        const subtitle = document.getElementById('dossier-patient-subtitle');
        if (subtitle) subtitle.innerText = `Patient : ${patientName} (${patientAge} ans) ${new Date().toLocaleDateString('fr-FR')}`;

        // ALWAYS build from data to ensure the report exactly matches the UI tables
        dossierModalBody.innerHTML = buildReportFromData(data);

        dossierModal.style.display = 'flex';
        document.body.style.overflow = 'hidden';
    }

    function renderMarkdownReport(md) {
        if (!md) return '';

        const lines = md.split('\n');
        let html = '';
        let currentParagraph = [];
        let currentList = [];

        function flushParagraph() {
            if (currentParagraph.length > 0) {
                const text = parseInlineMarkdown(currentParagraph.join('<br>'));
                html += `<p class="report-p">${text}</p>`;
                currentParagraph = [];
            }
        }

        function flushList() {
            if (currentList.length > 0) {
                const items = currentList.map(item => {
                    const cleanItem = parseInlineMarkdown(item);
                    return `<li style="margin-left: 20px; margin-bottom: 8px; list-style-type: disc;">${cleanItem}</li>`;
                }).join('');
                html += `<ul class="report-list" style="display: flex; flex-direction: column; padding-left: 20px;">${items}</ul>`;
                currentList = [];
            }
        }

        lines.forEach(line => {
            const trimmed = line.trim();
            if (!trimmed) {
                flushParagraph();
                flushList();
                return;
            }

            // Headings
            if (trimmed.startsWith('#')) {
                flushParagraph();
                flushList();
                const level = (trimmed.match(/^#+/) || ['#'])[0].length;
                const text = trimmed.replace(/^#+\s+/, '');
                html += `<h${level} class="report-h${level}">${text}</h${level}>`;
                return;
            }

            // Bullet list items
            if (trimmed.startsWith('- ') || trimmed.startsWith('* ')) {
                flushParagraph(); // List starts, so end any active paragraph
                const text = trimmed.replace(/^[-*]\s+/, '');
                currentList.push(text);
                return;
            }

            // If we have a regular line, flush any active list
            flushList();
            currentParagraph.push(trimmed);
        });

        flushParagraph();
        flushList();

        return `<div class="report-paper-sheet">${html}</div>`;
    }

    function parseInlineMarkdown(text) {
        return text
            .replace(/\*\*(.+?)\*\*/g, '<strong class="report-strong">$1</strong>')
            .replace(/\*(.+?)\*/g, '<em class="report-em">$1</em>');
    }

    function buildReportFromData(data) {
        const patient = data.patient_profile || {};
        const drugs = (data.drugs || []).map(d => typeof d === 'string' ? d : (d.display_name || d.name || d));
        const inters = data.interactions || [];
        const dosage = data.dosage || [];
        const ci = data.contraindications || [];

        let html = `<div class="report-paper-sheet">`;

        // Centered Title
        html += `<h1 class="report-h1">AVIS DE PHARMACIE CLINIQUE</h1>`;

        // Patient Info Box (Clean white style with light borders)
        html += `<div style="background:#f8fafc; border:1px solid #e2e8f0; border-radius:10px; padding:20px; margin-bottom:25px;">
            <div style="font-size:0.95rem; font-weight:800; color:#1e3a8a; margin-bottom:10px;">
                <i class="fa-solid fa-user-doctor"></i> INFORMATIONS DOSSIER PATIENT
            </div>
            <div style="display:grid; grid-template-columns:1fr 1fr; gap:10px; font-size:0.9rem;">
                <div><strong class="report-strong">Nom :</strong> ${patient.nom || patient.name || 'Inconnu'}</div>
                <div><strong class="report-strong">Âge :</strong> ${patient.age || patient.âge || 'N/A'} ans</div>
            </div>
        </div>`;

        // Synthèse Clinique
        const md = data.report_markdown || '';
        if (md && md.trim().length > 10) {
            html += `<h2 class="report-h2">Synthèse Clinique</h2>
            <div style="background:#fefce8; border:1px solid #fef08a; padding:15px; border-radius:10px; margin-bottom:25px; font-size:0.9rem; line-height:1.6; color:#451a03;">
                ${renderMarkdownReport(md).replace('<div class="report-paper-sheet">', '').replace('</div>', '')}
            </div>`;
        }

        // Drugs List
        html += `<h2 class="report-h2">Médicaments Analysés</h2>
        <div style="display:flex; flex-wrap:wrap; gap:8px; margin-bottom:25px;">`;
        drugs.forEach(d => {
            html += `<span style="background:#eff6ff; color:#1e3a8a; border:1px solid #bfdbfe; border-radius:6px; padding:4px 10px; font-size:0.8rem; font-weight:700;">${d}</span>`;
        });
        html += `</div>`;

        // Interactions Section
        if (inters.length > 0) {
            html += `<h2 class="report-h2">Analyse des Interactions</h2>`;
            inters.forEach(i => {
                html += `<div style="border-bottom:1px solid #f1f5f9; padding:10px 0; margin-bottom:10px;">
                    <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:4px;">
                        <span class="report-strong" style="font-size:0.95rem; color:#1e3a8a;">${i.drug_a} + ${i.drug_b}</span>
                        <span class="sev-badge ${i.severity.toLowerCase()}">${i.severity}</span>
                    </div>
                    <p class="report-p" style="margin:0;">${i.explanation}</p>
                </div>`;
            });
        }

        // Dosage Section
        if (dosage.length > 0) {
            html += `<h2 class="report-h2">Analyse des Dosages</h2>`;
            dosage.forEach(d => {
                const typeClass = d.type === 'Approprié' ? 'aucun' : 'majeur';
                html += `<div style="border-bottom:1px solid #f1f5f9; padding:10px 0; margin-bottom:10px;">
                    <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:4px;">
                        <span class="report-strong" style="font-size:0.95rem; color:#1e3a8a;">${d['médicament'] || d.drug}</span>
                        <span class="sev-badge ${typeClass}">${d.type}</span>
                    </div>
                    <p class="report-p" style="margin:0;">${d['explication'] || ''}</p>
                </div>`;
            });
        }

        // Contraindications Section
        if (ci.length > 0) {
            html += `<h2 class="report-h2">Alertes Cliniques & Contre-indications</h2>`;
            ci.forEach(c => {
                html += `<div style="border-bottom:1px solid #f1f5f9; padding:10px 0; margin-bottom:10px;">
                    <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:4px;">
                        <span class="report-strong" style="font-size:0.95rem; color:#1e3a8a;">${c.médicament || c.drug}</span>
                        <span class="sev-badge majeur">ALERTE</span>
                    </div>
                    <p class="report-p" style="margin:0;">${c.raison || c.reason}</p>
                </div>`;
            });
        }

        html += `</div>`;
        return html;
    }

    function closeDossier() {
        dossierModal.style.display = 'none';
        document.body.style.overflow = '';
    }

    if (dossierBtn) dossierBtn.addEventListener('click', openDossierModal);
    if (closeDossierModal) closeDossierModal.addEventListener('click', closeDossier);
    if (closeDossierBtn) closeDossierBtn.addEventListener('click', closeDossier);
    if (dossierModal) dossierModal.addEventListener('click', (e) => { if (e.target === dossierModal) closeDossier(); });
    if (downloadDossierBtn) downloadDossierBtn.addEventListener('click', () => { if (lastAnalysisData) generatePatientReport(lastAnalysisData); });


    function generatePatientReport(data, title = 'Dossier Patient Clinique', prefix = 'Dossier') {
        const { jsPDF } = window.jspdf;
        const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });

        const BLUE = [30, 58, 138];
        const LIGHT_BLUE = [14, 165, 233];
        const GRAY = [100, 116, 139];
        const DARK = [15, 23, 42];
        const WHITE = [255, 255, 255];
        const TEXT = [30, 41, 59];

        const pageW = doc.internal.pageSize.getWidth();
        const margin = 18;
        const contentW = pageW - margin * 2;
        let y = 0;

        // --- HEADER (Print-Friendly & Hospital Style) ---
        // Logo and Hospital Info
        doc.setTextColor(...BLUE);
        doc.setFontSize(12);
        doc.setFont('helvetica', 'bold');
        doc.text('CENTRE HOSPITALIER UNIVERSITAIRE', margin, 18);

        doc.setTextColor(...DARK);
        doc.setFontSize(8.5);
        doc.setFont('helvetica', 'bold');
        doc.text('SERVICE DE PHARMACIE CLINIQUE', margin, 23);

        // Hospital Service Detail
        doc.setTextColor(...GRAY);
        doc.setFontSize(8);
        doc.setFont('helvetica', 'normal');
        doc.text('Département de Pharmacie Clinique', margin, 27);
        doc.text('Unité de Conciliation Thérapeutique', margin, 31);

        // Right side info (Date)
        const now = new Date();
        const dateStr = now.toLocaleDateString('fr-FR');
        doc.setTextColor(...DARK);
        doc.setFontSize(9);
        doc.setFont('helvetica', 'normal');
        doc.text(`Date : ${dateStr}`, pageW - margin, 18, { align: 'right' });
        doc.text(`Dossier patient`, pageW - margin, 23, { align: 'right' });

        // Let's generate a unique reference number (for history tracking internally)
        const refStr = `REF-CLIN-${now.getFullYear()}${(now.getMonth() + 1).toString().padStart(2, '0')}${now.getDate().toString().padStart(2, '0')}-${Math.floor(1000 + Math.random() * 9000)}`;

        // A thin separator line
        doc.setDrawColor(226, 232, 240); // light grey
        doc.setLineWidth(0.5);
        doc.line(margin, 35, pageW - margin, 35);

        y = 44;

        // --- PATIENT INFO ---
        const patient = data.patient_profile || {};
        const patientName = patient.nom || patient.name || patient.patient_name || 'Patient Inconnu';
        const patientAge = patient.age || patient.âge || patient.patient_age || 'N/A';
        const pathologiesText = patient.pathologies || patient.pathologie || 'Aucune pathologie déclarée';

        doc.setTextColor(...DARK);
        doc.setFontSize(10);
        doc.setFont('helvetica', 'bold');
        doc.text(`Patient : ${patientName} (${patientAge} ans)`, margin, y);

        doc.setFont('helvetica', 'normal');
        doc.text(`ATCD / Pathologie(s) : ${pathologiesText}`, margin, y + 5.5);

        y += 16;

        // Draw Document Title
        doc.setTextColor(...DARK);
        doc.setFontSize(12);
        doc.setFont('helvetica', 'bold');
        const mainTitle = "AVIS DE PHARMACIE CLINIQUE";
        const titleWidth = doc.getTextWidth(mainTitle);
        doc.text(mainTitle, (pageW - titleWidth) / 2, y);
        y += 10;

        // State trackers for section colors
        let currentSectionColor = BLUE;

        // --- HELPER: write a section title ---
        function sectionTitle(title, color) {
            if (y > 255) { doc.addPage(); y = 20; }
            doc.setTextColor(...DARK);
            doc.setFontSize(10.5);
            doc.setFont('helvetica', 'bold');
            doc.text(title, margin, y);
            y += 7;
        }

        // --- HELPER: write wrapped paragraph text with bold support ---
        function writeRichParagraph(text, color, hasLeftBorder = false, borderColor = BLUE) {
            color = color || TEXT;
            doc.setTextColor(...color);
            doc.setFontSize(9.5);

            const regex = /(\*\*.*?\*\*|\s+)/g;
            const tokens = text.split(regex).filter(Boolean);

            let currentLine = [];
            let currentLineWidth = 0;
            const paragraphLines = [];
            const textIndent = hasLeftBorder ? 8 : 0;
            const paragraphContentW = contentW - textIndent;

            tokens.forEach(token => {
                let tokenText = token;
                let isBold = false;
                if (token.startsWith('**') && token.endsWith('**')) {
                    tokenText = token.slice(2, -2);
                    isBold = true;
                }

                doc.setFont('helvetica', isBold ? 'bold' : 'normal');
                const tokenW = doc.getTextWidth(tokenText);

                if (currentLineWidth + tokenW > paragraphContentW) {
                    paragraphLines.push(currentLine);
                    currentLine = [{ text: tokenText, isBold: isBold, width: tokenW }];
                    currentLineWidth = tokenW;
                } else {
                    currentLine.push({ text: tokenText, isBold: isBold, width: tokenW });
                    currentLineWidth += tokenW;
                }
            });
            if (currentLine.length > 0) {
                paragraphLines.push(currentLine);
            }

            const startY = y;
            paragraphLines.forEach(line => {
                if (y > 270) { doc.addPage(); y = 20; }
                let currentX = margin + textIndent;
                line.forEach(segment => {
                    doc.setFont('helvetica', segment.isBold ? 'bold' : 'normal');
                    doc.text(segment.text, currentX, y);
                    currentX += segment.width;
                });
                y += 5.5;
            });

            // Left border removed for clean human style

            y += 2.5;
        }

        function writeParagraph(text, color) {
            writeRichParagraph(text, color);
        }

        // --- HELPER: write bold label + normal text on same line ---
        function writeBullet(label, text) {
            if (y > 270) { doc.addPage(); y = 20; }
            doc.setTextColor(...BLUE);
            doc.setFontSize(9.5);
            doc.setFont('helvetica', 'bold');
            const labelW = doc.getTextWidth(label ? `${label} : ` : '');
            if (label) doc.text(`${label} : `, margin + 4, y);

            doc.setTextColor(...TEXT);
            const wrapped = doc.splitTextToSize(text, contentW - labelW - 4);
            wrapped.forEach((l, idx) => {
                if (y > 270) { doc.addPage(); y = 20; }
                const currentX = idx === 0 ? margin + 4 + labelW : margin + 4;
                doc.setFont('helvetica', 'normal');
                doc.text(l, currentX, y);
                y += 5.5;
            });
            y += 1;
        }

        // --- 1. RENDER CLINICAL SYNTHESIS (MARKDOWN) IF AVAILABLE ---
        const md = data.report_markdown || '';
        if (md && md.trim().length > 50) {
            // Parse markdown into clean paragraphs for PDF
            const lines = md.split('\n');
            lines.forEach(line => {
                const trimmed = line.trim();
                if (!trimmed) { y += 3; return; }

                // Skip redundant info that is already in our header patient card
                if (trimmed.startsWith('**Patient :**') || trimmed.startsWith('**Patient:**') ||
                    trimmed.startsWith('**ATCD / Pathologie(s) :**') || trimmed.startsWith('**ATCD / Pathologie(s):**') ||
                    trimmed.startsWith('**ATCD / Pathologies :**') || trimmed.startsWith('**ATCD / Pathologies:**')) {
                    return;
                }

                // If it is AVIS PHARMACEUTIQUE heading, skip or style it beautifully
                if (trimmed === '### AVIS PHARMACEUTIQUE' || trimmed === '# AVIS PHARMACEUTIQUE' || trimmed === '## AVIS PHARMACEUTIQUE') {
                    return; // Skip since we have the main centered title
                }

                // Headings (####, ###, ##, #)
                const h4 = trimmed.match(/^#{4}\s+(.+)$/);
                const h3 = trimmed.match(/^#{3}\s+(.+)$/);
                const h2 = trimmed.match(/^#{2}\s+(.+)$/);
                const h1 = trimmed.match(/^#{1}\s+(.+)$/);

                if (h4) {
                    if (y > 255) { doc.addPage(); y = 20; }
                    doc.setTextColor(...BLUE);
                    doc.setFontSize(10);
                    doc.setFont('helvetica', 'bold');
                    doc.text(h4[1], margin, y);
                    y += 6;
                } else if (h3) {
                    if (y > 255) { doc.addPage(); y = 20; }
                    doc.setTextColor(...BLUE);
                    doc.setFontSize(11);
                    doc.setFont('helvetica', 'bold');
                    doc.text(h3[1], margin, y);
                    y += 7;
                } else if (h2) {
                    if (y > 250) { doc.addPage(); y = 20; }
                    doc.setTextColor(...BLUE);
                    doc.setFontSize(11.5);
                    doc.setFont('helvetica', 'bold');
                    doc.text(h2[1], margin, y);
                    y += 8;
                } else if (h1) {
                    if (y > 245) { doc.addPage(); y = 20; }
                    doc.setTextColor(...BLUE);
                    doc.setFontSize(12);
                    doc.setFont('helvetica', 'bold');
                    doc.text(h1[1], margin, y);
                    y += 10;
                } else {
                    // Check if line is a section header like "**1. Synthèse...**"
                    const sectionMatch = trimmed.match(/^\*\*(\d+\.\s+.*?)\*\*:?$/);
                    if (sectionMatch) {
                        const secTitle = sectionMatch[1];
                        currentSectionColor = BLUE;

                        if (y > 250) { doc.addPage(); y = 20; }
                        y += 4; // Add some space before the section
                        doc.setTextColor(...currentSectionColor);
                        doc.setFontSize(10.5);
                        doc.setFont('helvetica', 'bold');
                        doc.text(secTitle, margin, y);
                        y += 6;
                        return;
                    }

                    if (trimmed.startsWith('- ') || trimmed.startsWith('* ')) {
                        // Bullet with bold support and left vertical border
                        const text = trimmed.replace(/^[-*]\s+/, '');
                        if (y > 270) { doc.addPage(); y = 20; }

                        // Draw bullet point symbol
                        doc.setTextColor(...currentSectionColor);
                        doc.setFontSize(9.5);
                        doc.setFont('helvetica', 'bold');
                        doc.text('•', margin + 9, y);

                        doc.setTextColor(...TEXT);

                        // Tokenize and wrap
                        const regex = /(\*\*.*?\*\*|\s+)/g;
                        const tokens = text.split(regex).filter(Boolean);

                        let currentLine = [];
                        let currentLineWidth = 0;
                        const textIndent = 14; // bullet starts at margin + 14
                        const bulletContentW = contentW - textIndent;
                        const linesList = [];

                        tokens.forEach(token => {
                            let tokenText = token;
                            let isBold = false;
                            if (token.startsWith('**') && token.endsWith('**')) {
                                tokenText = token.slice(2, -2);
                                isBold = true;
                            }

                            doc.setFont('helvetica', isBold ? 'bold' : 'normal');
                            const tokenW = doc.getTextWidth(tokenText);

                            if (currentLineWidth + tokenW > bulletContentW) {
                                linesList.push(currentLine);
                                currentLine = [{ text: tokenText, isBold: isBold, width: tokenW }];
                                currentLineWidth = tokenW;
                            } else {
                                currentLine.push({ text: tokenText, isBold: isBold, width: tokenW });
                                currentLineWidth += tokenW;
                            }
                        });
                        if (currentLine.length > 0) {
                            linesList.push(currentLine);
                        }

                        const startY = y;
                        linesList.forEach(line => {
                            if (y > 270) { doc.addPage(); y = 20; }
                            let currentX = margin + textIndent;
                            line.forEach(segment => {
                                doc.setFont('helvetica', segment.isBold ? 'bold' : 'normal');
                                doc.text(segment.text, currentX, y);
                                currentX += segment.width;
                            });
                            y += 5.5;
                        });

                        y += 1.5;
                    } else {
                        // Normal paragraph with bold support and no left border
                        writeRichParagraph(trimmed, TEXT, false, currentSectionColor);
                    }
                }
            });
            y += 4;
        }

        // --- 2. RENDER STRUCTURED DATA SECTIONS ---
        const drugs = (data.drugs || []).map(d => typeof d === 'string' ? d : (d.display_name || d.name || d));
        const inters = data.interactions || [];
        const dosage = data.dosage || [];
        const ci = data.contraindications || [];

        // Check page boundaries before starting sections
        if (y > 240) { doc.addPage(); y = 20; }

        sectionTitle('Médicaments Analysés', BLUE);
        writeParagraph(drugs.join(', '));
        y += 3;

        if (inters.length > 0) {
            sectionTitle('Analyse des Interactions', [217, 119, 6]);
            inters.forEach(i => {
                writeBullet(`${i.drug_a} + ${i.drug_b} (${i.severity})`, i.explanation || '');
            });
            y += 3;
        }

        if (dosage.length > 0) {
            sectionTitle('Analyse des Dosages', [16, 124, 65]);
            dosage.forEach(d => {
                const status = d.type && d.type !== 'Approprié' ? `${d.type}. ` : '';
                writeBullet(d['médicament'] || d.drug, `${status}${d['explication'] || ''}`);
            });
            y += 3;
        }

        if (ci.length > 0) {
            sectionTitle('Alertes Cliniques & Contre-indications', [109, 40, 217]);
            ci.forEach(c => {
                writeBullet(c['médicament'] || c.drug, c['raison'] || c.reason || '');
            });
            y += 3;
        }

        // --- SIGNATURE SECTION ---
        y += 12;
        if (y > 240) { doc.addPage(); y = 25; }

        doc.setDrawColor(226, 232, 240);
        doc.setLineWidth(0.4);
        doc.line(margin, y, margin + contentW, y);
        y += 8;

        doc.setTextColor(...DARK);
        doc.setFontSize(9.5);
        doc.setFont('helvetica', 'bold');
        doc.text("VALIDATION ET SIGNATURE", margin, y);

        // Signature details
        y += 6;
        doc.setTextColor(...TEXT);
        doc.setFontSize(8.5);
        doc.setFont('helvetica', 'normal');
        doc.text("Avis rédigé par le pharmacien clinicien référent.", margin, y);

        // Collect references actually used
        const usedBases = [];
        const seenBases = new Set();

        const addBase = (sourceFile) => {
            if (!sourceFile) return;
            const src = sourceFile.toLowerCase();
            if (src.includes('beers') || src.includes('ags')) {
                if (!seenBases.has('Beers')) {
                    seenBases.add('Beers');
                    usedBases.push('Beers');
                }
            } else if (src.includes('laroche')) {
                if (!seenBases.has('Laroche')) {
                    seenBases.add('Laroche');
                    usedBases.push('Laroche 2009');
                }
            } else if (src.includes('stopp') || src.includes('start') || src.includes('carnet')) {
                if (!seenBases.has('StoppStart')) {
                    seenBases.add('StoppStart');
                    usedBases.push('STOPP/START 2024');
                }
            } else if (src.includes('breucker')) {
                if (!seenBases.has('DeBreucker')) {
                    seenBases.add('DeBreucker');
                    usedBases.push('De Breucker');
                }
            } else if (src.includes('priscus') || src.includes('arztebl') || src.includes('dtsch')) {
                if (!seenBases.has('Priscus')) {
                    seenBases.add('Priscus');
                    usedBases.push('PRISCUS');
                }
            } else if (src.includes('ddi') || src.includes('interaction') || src.includes('csv') || src.includes('json')) {
                if (!seenBases.has('Interactions')) {
                    seenBases.add('Interactions');
                    usedBases.push("Base d'interactions");
                }
            }
        };

        if (data.dosage) data.dosage.forEach(d => {
            if (d.source && d.source !== 'Aucun') addBase(d.source);
        });
        if (data.contraindications) data.contraindications.forEach(c => {
            if (c.source && c.source !== 'Aucun') addBase(c.source);
        });
        if (data.interactions) data.interactions.forEach(i => {
            if (i.source && i.source !== 'Aucun' && i.severity !== 'ANONYME') {
                addBase(i.source);
            }
        });

        let refText = "Conforme aux référentiels gériatriques standards.";
        if (usedBases.length > 0) {
            refText = "Conforme aux référentiels : " + usedBases.join(', ') + ".";
        }
        doc.text(refText, margin, y + 4.5);

        // Simple human signature text on the right
        doc.setFontSize(9);
        doc.setFont('helvetica', 'italic');
        doc.text("Fait à Tunis, le " + dateStr, pageW - margin - 55, y, { align: 'left' });
        doc.setFont('helvetica', 'bold');
        doc.text("Le Pharmacien Clinicien", pageW - margin - 55, y + 5, { align: 'left' });

        y += 18;

        // --- FOOTER ---
        const pageCount = doc.internal.getNumberOfPages();
        for (let i = 1; i <= pageCount; i++) {
            doc.setPage(i);
            doc.setDrawColor(226, 232, 240);
            doc.setLineWidth(0.3);
            doc.line(margin, 285, pageW - margin, 285);
            doc.setFontSize(7.5);
            doc.setFont('helvetica', 'italic');
            doc.setTextColor(...GRAY);
            doc.text("Document confidentiel. Réservé à l'usage médical.", margin, 291);
            doc.text(`Page ${i} / ${pageCount}`, pageW - margin, 291, { align: 'right' });
        }

        // --- SAVE ---
        const filename = `${prefix}_${patientName.replace(/ /g, '_')}_${now.toISOString().slice(0, 10)}.pdf`;
        doc.save(filename);
    }


    function updateDosageChart(data) {
        const ctx = document.getElementById('dosageChart');
        if (!ctx) return;

        const counts = {
            'Sur-dosage': data.filter(d => d.type === 'Sur-dosage').length,
            'Sous-dosage': data.filter(d => d.type === 'Sous-dosage').length,
            'Approprié': data.filter(d => d.type === 'Approprié').length
        };

        if (dosageChartInstance) dosageChartInstance.destroy();

        dosageChartInstance = new Chart(ctx, {
            type: 'doughnut',
            data: {
                labels: Object.keys(counts),
                datasets: [{
                    data: Object.values(counts),
                    backgroundColor: ['#ef4444', '#3b82f6', '#22c55e'],
                    borderWidth: 0,
                    hoverOffset: 10
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: { position: 'right', labels: { usePointStyle: true, font: { size: 12, weight: '600' } } }
                },
                cutout: '70%'
            }
        });
    }

    function updateInteractionsChart(inters) {
        const counts = { 'MAJEUR': 0, 'MODÉRÉ': 0, 'MINEUR': 0, 'ANONYME': 0 };
        inters.forEach(i => {
            const s = i.severity || 'ANONYME';
            if (counts.hasOwnProperty(s)) counts[s]++;
            else counts['ANONYME']++;
        });

        const ctx = document.getElementById('interactionsChart').getContext('2d');
        if (interactionsChartInstance) {
            interactionsChartInstance.destroy();
        }

        interactionsChartInstance = new Chart(ctx, {
            type: 'bar',
            data: {
                labels: ['Majeure', 'Modérée', 'Mineure', 'Anonyme'],
                datasets: [{
                    label: 'Nombre d\'interactions',
                    data: [counts['MAJEUR'], counts['MODÉRÉ'], counts['MINEUR'], counts['ANONYME']],
                    backgroundColor: ['#ef4444', '#f97316', '#eab308', '#94a3b8'],
                    borderRadius: 8,
                    barThickness: 40
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: { display: false }
                },
                scales: {
                    y: { beginAtZero: true, ticks: { stepSize: 1, color: '#64748b' }, grid: { display: false } },
                    x: { ticks: { color: '#64748b' }, grid: { display: false } }
                }
            }
        });
    }

    if (analyzeBtn) {
        analyzeBtn.addEventListener('click', performFullAnalysis);
    }

    // ---- CLEAR / REMOVE FUNCTIONS ----
    const clearDashboard = () => {
        if (prescriptionText) prescriptionText.value = '';
        if (pdfInput) pdfInput.value = '';
        if (uploadBox) uploadBox.classList.remove('hidden');
        if (pdfPreview) pdfPreview.classList.add('hidden');
        if (analysisResults) analysisResults.classList.add('hidden');
        if (actionsContainer) actionsContainer.classList.add('hidden');
        if (clinicalDetails) clinicalDetails.classList.add('hidden');
        if (statsGrid) {
            statsGrid.style.setProperty('display', 'none', 'important');
            statsGrid.dataset.loaded = 'false';
        }
        if (quickDrugsList) quickDrugsList.innerHTML = '';

        // Reset stats values
        document.getElementById('count-meds-stat').innerText = '0';
        document.getElementById('count-inters').innerText = '0';
        document.getElementById('analysis-time').innerText = '0.0s';
        const medsStat = document.getElementById('count-meds-stat');
        const interStat = document.getElementById('count-inters');
        const timeStat = document.getElementById('analysis-time');
        if (medsStat) medsStat.innerText = '0';
        if (interStat) interStat.innerText = '0';
        if (timeStat) timeStat.innerText = '0.0s';
    };

    // Attach listeners to all clear/remove buttons
    document.querySelectorAll('.remove-file, .btn-action.secondary').forEach(btn => {
        btn.addEventListener('click', (e) => {
            e.preventDefault();
            e.stopPropagation();
            clearDashboard();
        });
    });

    // Global history storage to avoid re-fetching
    window.loadedHistory = [];

    // Function to view analysis details from history in a Modal
    window.viewHistoryDetail = (id) => {
        console.log("🚀 Clicked viewHistoryDetail for ID:", id);

        if (!window.loadedHistory || window.loadedHistory.length === 0) {
            console.error("❌ No history loaded in window.loadedHistory");
            return;
        }

        const item = window.loadedHistory.find(h => String(h.id) === String(id));
        if (!item) {
            console.error("❌ Could not find history item with ID:", id);
            return;
        }

        const modal = document.getElementById('dossier-modal');
        const modalBody = document.getElementById('dossier-modal-body');

        if (!modal || !modalBody) {
            console.error("❌ Modal elements not found in DOM");
            return;
        }

        // 1. Prepare Modal Header
        const modalTitle = modal.querySelector('.modal-title-box h3');
        if (modalTitle) modalTitle.innerText = "Historique";

        const modalSubtitle = document.getElementById('dossier-patient-subtitle');
        if (modalSubtitle) {
            const patientName = item.summary?.patient_name || 'Patient';
            const patientAge = item.summary?.patient_age || 'N/A';
            const parts = (item.timestamp || '').split(' ')[0].split('-');
            const dateStr = parts.length === 3 ? `${parts[2]}/${parts[1]}/${parts[0]}` : item.timestamp;
            modalSubtitle.innerText = `Patient : ${patientName} (${patientAge} ans) ${dateStr}`;
        }

        // 1.5 Calculate counts from results for accuracy
        const results = item.results || [];
        const majorCount = results.filter(r => String(r.severity).toUpperCase() === 'MAJEUR').length;
        const moderateCount = results.filter(r => String(r.severity).toUpperCase() === 'MODÉRÉ').length;
        const minorCount = results.filter(r => String(r.severity).toUpperCase() === 'MINEUR').length;

        // 2. Build the Report Content
        let reportHtml = `
            <div class="history-report-container">
                ${item.summary?.report_md ? renderMarkdownReport(item.summary.report_md) : ''}
                <div class="report-section" style="margin-top:20px;">
                    <h4 class="report-h4"><i class="fa-solid fa-capsules"></i> Médicaments Prescrits</h4>
                    <div style="display:flex; flex-wrap:wrap; gap:8px; margin-top:10px;">
                        ${item.drugs.map(d => `<span class="badge-med-modern">${d}</span>`).join('')}
                    </div>
                </div>

                <div class="report-section" style="margin-top:25px;">
                    <h4 class="report-h4"><i class="fa-solid fa-triangle-exclamation"></i> Synthèse des Interactions</h4>
                    <div class="report-stats-mini">
                        <div class="mini-chip danger">Majeures: ${majorCount}</div>
                        <div class="mini-chip warning">Modérées: ${moderateCount}</div>
                        <div class="mini-chip info">Mineures: ${minorCount}</div>
                    </div>
                </div>

                <div class="report-section" style="margin-top:25px;">
                    <h4 class="report-h4"><i class="fa-solid fa-list-check"></i> Interactions Médicamenteuses</h4>
                    <div class="history-results-list">
                        ${results.length > 0 ?
                results.map(res => `
                                <div class="res-item-simple">
                                    <div style="display:flex; justify-content:space-between; align-items:center;">
                                        <span class="res-med">${res.drug_a} + ${res.drug_b}</span>
                                        <span class="res-sev ${String(res.severity).toLowerCase()}">${res.severity}</span>
                                    </div>
                                    <p class="res-desc">${res.explanation || "Pas de description"}</p>
                                </div>
                            `).join('') : '<p style="color:#94a3b8; font-style:italic;">Aucune interaction détectée.</p>'
            }
                    </div>
                </div>

                ${item.dosage && item.dosage.length > 0 ? `
                <div class="report-section" style="margin-top:25px;">
                    <h4 class="report-h4" style="color:#22c55e;"><i class="fa-solid fa-vial"></i> Analyse des Dosages</h4>
                    <div class="history-results-list">
                        ${item.dosage.map(d => `
                            <div class="res-item-simple" style="border-left:4px solid #22c55e;">
                                <div style="display:flex; justify-content:space-between; align-items:center;">
                                    <span class="res-med">${d.drug || d.médicament}</span>
                                    <span class="res-sev" style="background:#dcfce7; color:#166534;">${d.type}</span>
                                </div>
                                <p class="res-desc">${d.explication || d.explanation || ""}</p>
                            </div>
                        `).join('')}
                    </div>
                </div>
                ` : ''}

                ${item.contraindications && item.contraindications.length > 0 ? `
                <div class="report-section" style="margin-top:25px;">
                    <h4 class="report-h4" style="color:#ef4444;"><i class="fa-solid fa-ban"></i> Contre-indications / Alertes</h4>
                    <div class="history-results-list">
                        ${item.contraindications.map(c => `
                            <div class="res-item-simple" style="border-left:4px solid #ef4444;">
                                <div style="display:flex; justify-content:space-between; align-items:center;">
                                    <span class="res-med">${c.drug || c.médicament}</span>
                                    <span class="res-sev" style="background:#fee2e2; color:#991b1b;">ALERTE</span>
                                </div>
                                <p class="res-desc">${c.reason || c.raison || ""}</p>
                            </div>
                        `).join('')}
                    </div>
                </div>
                ` : ''}
            </div>
        `;

        modalBody.innerHTML = reportHtml;

        // --- DELETE BINDING FOR HISTORY MODAL ---
        const footer = modal.querySelector('.modal-footer-v2');
        if (footer) {
            // We want to keep the close and download buttons, and add a delete one
            footer.innerHTML = `
                <button onclick="window.deleteHistoryItem('${item.id}'); document.getElementById('dossier-modal').style.display='none';" class="btn-clear" style="margin:0; padding:10px 22px; color:#ef4444; border-color:#fca5a5;">
                    <i class="fa-solid fa-trash-can"></i> Supprimer
                </button>
                <div style="display:flex; gap:10px;">
                    <button id="close-dossier-btn-modal" class="btn-clear" style="margin: 0; padding: 10px 22px;">Fermer</button>
                    <button id="download-dossier-btn-modal" class="btn-analyze" style="margin: 0; padding: 10px 24px;">
                        <i class="fa-solid fa-download"></i> Télécharger PDF
                    </button>
                </div>
            `;

            // Re-bind buttons
            document.getElementById('close-dossier-btn-modal').onclick = () => {
                modal.style.display = 'none';
                document.body.style.overflow = '';
            };

            document.getElementById('download-dossier-btn-modal').onclick = () => {
                const pdfData = {
                    drugs: item.drugs.map(d => ({ display_name: d })),
                    interactions: item.results,
                    dosage: item.dosage || [],
                    contraindications: item.contraindications || [],
                    patient_profile: {
                        patient_name: item.summary?.patient_name || "Inconnu",
                        patient_age: item.summary?.patient_age || "N/A"
                    }
                };
                generatePatientReport(pdfData, 'Rapport Historique', 'Historique');
            };
        }

        // --- FORCE DISPLAY ---
        modal.style.display = 'flex';
        modal.classList.add('active');
        document.body.style.overflow = 'hidden';

        console.log("✅ Modal display set to FLEX and active with PDF binding");
    };

    // ---- HISTORY & DATABASE ----
    window.fetchHistory = async () => {
        const hl = document.getElementById('history-list');
        if (!hl) return;

        hl.innerHTML = '<div style="text-align:center;padding:50px;"><i class="fa-solid fa-sync fa-spin"></i></div>';
        try {
            const r = await fetch('/api/history');
            const d = await r.json();
            hl.innerHTML = '';

            window.loadedHistory = d.history || [];
            console.log("📚 History loaded:", window.loadedHistory.length, "items");

            if (window.loadedHistory.length > 0) {
                window.loadedHistory.forEach(item => {
                    const div = document.createElement('div');
                    div.className = 'history-item';
                    div.style.cssText = 'padding:20px; border:1px solid #e2e8f0; border-radius:12px; margin-bottom:15px; display:flex; flex-direction:column; gap:12px; background:white; position:relative;';

                    const drugsHtml = item.drugs?.map(drug => `<span style="font-size:0.75rem; background:#eff6ff; color:#2563eb; padding:3px 10px; border-radius:20px; border:1px solid #dbeafe;">${drug}</span>`).join(' ') || '<i>Aucun médicament</i>';

                    div.innerHTML = `
                        <div style="display:flex; justify-content:space-between; align-items:flex-start;">
                            <div style="display:flex; flex-direction:column; gap:4px;">
                                <div style="font-weight:700; color:#1e293b; font-size:0.95rem;">Analyse du ${item.timestamp}</div>
                                <div style="display:flex; gap:10px; flex-wrap:wrap;">
                                    <span style="font-size:0.8rem; font-weight:600; color:#2563eb; background:#eff6ff; padding:2px 10px; border-radius:6px;">
                                        <i class="fa-solid fa-user" style="margin-right:5px;"></i> ${item.summary?.patient_name || "Patient"}
                                    </span>
                                    ${item.summary?.doctor_name && item.summary.doctor_name !== 'Inconnu' ? `
                                    <span style="font-size:0.8rem; font-weight:600; color:#059669; background:#ecfdf5; padding:2px 10px; border-radius:6px;">
                                        <i class="fa-solid fa-user-doctor" style="margin-right:5px;"></i> ${item.summary.doctor_name}
                                    </span>
                                    ` : ''}
                                </div>
                            </div>
                            <div style="display:flex; gap:10px;">
                                <button onclick="window.viewHistoryDetail('${item.id}')" class="btn-action secondary" style="padding:8px 20px; font-size:0.8rem; border-radius:8px; cursor:pointer;">Voir Détails</button>
                                <button onclick="window.deleteHistoryItem('${item.id}')" class="btn-icon-only" style="color:#ef4444; background:#fee2e2; border:none; width:34px; height:34px; border-radius:8px; cursor:pointer;" title="Supprimer">
                                    <i class="fa-solid fa-trash-can"></i>
                                </button>
                            </div>
                        </div>
                        <div style="display:flex; flex-wrap:wrap; gap:8px; margin-top:5px;">
                            ${drugsHtml}
                        </div>
                    `;
                    hl.appendChild(div);
                });
            } else {
                hl.innerHTML = '<div style="text-align:center; padding:50px; color:#94a3b8;"><i class="fa-solid fa-box-open" style="font-size:3rem; margin-bottom:15px; display:block;"></i>Aucun historique disponible.</div>';
            }
        } catch (e) {
            console.error("History Error:", e);
            hl.innerHTML = '<div class="placeholder-text" style="color:#ef4444;">Erreur lors de la récupération de l\'historique.</div>';
        }
    };

    window.deleteHistoryItem = async (id) => {
        if (!confirm("Voulez-vous vraiment supprimer cette analyse ?")) return;
        try {
            // 1. UI Feedback: Remove from local memory immediately
            window.loadedHistory = window.loadedHistory.filter(h => String(h.id) !== String(id));

            // 2. Backend Call
            const r = await fetch(`/api/history/${id}`, { method: 'DELETE' });
            const d = await r.json();

            if (d.success) {
                console.log("🗑️ Analyse supprimée avec succès.");
                window.fetchHistory(); // Full refresh
            }
        } catch (e) {
            console.error("Delete Error:", e);
            window.fetchHistory(); // Refresh on error to restore state
        }
    };

    window.clearAllHistory = async () => {
        if (!confirm("⚠️ Voulez-vous vraiment EFFACER TOUT l'historique ?")) return;
        try {
            const r = await fetch(`/api/history`, { method: 'DELETE' });
            const d = await r.json();
            if (d.success) window.fetchHistory();
        } catch (e) { console.error("Clear Error:", e); }
    };

    // Bind Clear All button
    const clearBtn = document.getElementById('clear-history-btn');
    if (clearBtn) clearBtn.onclick = window.clearAllHistory;

    const updateBtn = document.getElementById('update-db-btn');
    if (updateBtn) {
        updateBtn.addEventListener('click', async () => {
            const originalHtml = updateBtn.innerHTML;
            updateBtn.disabled = true;
            updateBtn.classList.add('processing');
            updateBtn.innerHTML = `<i class="fa-solid fa-gear"></i> Indexation en cours...`;

            try {
                const r = await fetch(`${API_BASE}/update_vector_store`, { method: 'POST' });
                const d = await r.json();

                if (d.success) {
                    updateBtn.innerHTML = `<i class="fa-solid fa-check"></i> Terminé !`;
                    setTimeout(() => { updateBtn.innerHTML = originalHtml; }, 3000);
                } else {
                    alert("❌ Échec de la mise à jour.");
                    updateBtn.innerHTML = originalHtml;
                }
            } catch (e) {
                alert("Erreur de connexion.");
                updateBtn.innerHTML = originalHtml;
            } finally {
                updateBtn.disabled = false;
                updateBtn.classList.remove('processing');
            }
        });
    }

    // ---- CHATBOT LOGIC (Unifié via le Floating Widget) ----
    let chatHistory = [];


    // ---- CHATBOT WIDGET LOGIC (Unified) ----
    const chatTriggerWidget = document.getElementById('chatTriggerWidget');
    const chatWindowWidget = document.getElementById('chatWindowWidget');
    const closeChatWidget = document.getElementById('closeChatWidget');
    const chatInputWidget = document.getElementById('chat-input-widget');
    const chatSendWidget = document.getElementById('chat-send-widget');
    const chatMessagesWidget = document.getElementById('chat-messages-widget');

    if (chatTriggerWidget && chatWindowWidget) {
        chatTriggerWidget.onclick = () => chatWindowWidget.classList.toggle('active');
    }
    if (closeChatWidget && chatWindowWidget) {
        closeChatWidget.onclick = () => chatWindowWidget.classList.remove('active');
    }

    async function sendChatWidget() {
        const msg = chatInputWidget.value.trim();
        if (!msg) return;

        appendMsgToWidget('user', msg);
        chatInputWidget.value = '';

        // Create the bot message bubble early for streaming
        const botMsgDiv = document.createElement('div');
        botMsgDiv.className = 'message bot';
        botMsgDiv.innerHTML = `<div class="bubble"><i class="fa-solid fa-ellipsis fa-fade"></i></div>`;
        chatMessagesWidget.appendChild(botMsgDiv);
        const bubble = botMsgDiv.querySelector('.bubble');
        chatMessagesWidget.scrollTop = chatMessagesWidget.scrollHeight;

        try {
            const response = await fetch(`${API_BASE}/chat`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ message: msg, history: chatHistory, lang: 'fr' })
            });

            if (!response.ok) throw new Error("Erreur serveur");

            // Nettoyage de l'icône de chargement
            bubble.innerHTML = '';

            const reader = response.body.getReader();
            const decoder = new TextDecoder();
            let fullText = "";

            let currentStatus = "";
            while (true) {
                const { done, value } = await reader.read();
                if (done) break;

                const chunk = decoder.decode(value, { stream: true });

                // --- Gestion du STATUS ---
                if (chunk.includes('[STATUS]')) {
                    const statusMatch = chunk.match(/\[STATUS\]([^\[\n|]+)/);
                    if (statusMatch) {
                        currentStatus = statusMatch[1];
                        bubble.innerHTML = `<div style="font-size:0.8rem; color:#64748b; font-style:italic;"><i class="fa-solid fa-spinner fa-spin-pulse" style="margin-right:8px;"></i>${currentStatus}</div>`;
                        continue;
                    }
                }

                fullText += chunk;

                if (fullText.includes('|SOURCES|')) {
                    const parts = fullText.split('|SOURCES|');
                    const messageBody = parts[0].trim();
                    const afterSources = parts[1] || "";

                    const subParts = afterSources.split('|CONFIDENCE|');
                    const sourcesList = subParts[0] ? subParts[0].split(',').filter(s => s.trim() !== "") : [];
                    const confidenceScore = subParts[1] || "0";
                    const scoreInt = parseInt(confidenceScore);
                    const scoreColor = scoreInt > 80 ? '#10b981' : '#f59e0b';
                    let confidenceHtml = "";

                    if (scoreInt > 0) {
                        confidenceHtml = `
                            <div style="margin-top:12px; display:flex; align-items:center; gap:10px; padding:8px; background:#f8fafc; border-radius:10px; border:1px solid #e2e8f0;">
                                <div style="flex:1;">
                                    <div style="display:flex; justify-content:space-between; font-size:0.6rem; font-weight:700; color:#64748b; margin-bottom:3px;">
                                        <span>INDICE DE FIABILITÉ</span>
                                        <span style="color:${scoreColor}">${confidenceScore}%</span>
                                    </div>
                                    <div style="width:100%; height:4px; background:#e2e8f0; border-radius:2px; overflow:hidden;">
                                        <div style="width:${confidenceScore}%; height:100%; background:${scoreColor}; transition:width 1s ease;"></div>
                                    </div>
                                </div>
                            </div>
                        `;
                    }

                    let displayHtml = messageBody.replace(/\[MED_INFO\]/g, '').replace(/\n/g, '<br>').trim();

                    if (sourcesList.length > 0) {
                        const sourceTags = sourcesList.map(s => `
                            <div class="premium-source-badge" style="display:inline-flex; align-items:center; gap:5px; background:#eff6ff; color:#2563eb; padding:4px 10px; border-radius:8px; font-size:0.7rem; border:1px solid #dbeafe; margin-top:5px; margin-right:5px;">
                                <i class="fa-solid fa-file-shield"></i>
                                <span>${s.trim()}</span>
                            </div>
                        `).join('');

                        displayHtml += `<div style="margin-top:15px; border-top:1px solid #e2e8f0; padding-top:10px;">
                            <div style="font-size:0.65rem; font-weight:800; color:#94a3b8; margin-bottom:5px; letter-spacing:0.5px;">SOURCES VÉRIFIÉES :</div>
                            ${sourceTags}
                            ${confidenceHtml}
                        </div>`;
                    } else {
                        displayHtml += confidenceHtml;
                    }
                    bubble.innerHTML = displayHtml;
                } else {
                    // Rendu normal pendant le stream
                    bubble.innerHTML = fullText.replace(/\[MED_INFO\]/g, '').replace(/\n/g, '<br>');
                }
                chatMessagesWidget.scrollTop = chatMessagesWidget.scrollHeight;
            }

            chatHistory.push({ role: 'user', content: msg });
            chatHistory.push({ role: 'assistant', content: fullText });

        } catch (e) {
            bubble.innerHTML = "Erreur de connexion.";
            console.error(e);
        }
    }

    function appendMsgToWidget(role, text) {
        const msgDiv = document.createElement('div');
        msgDiv.className = `message ${role}`;
        msgDiv.innerHTML = `<div class="bubble">${text.replace(/\n/g, '<br>')}</div>`;
        chatMessagesWidget.appendChild(msgDiv);
        chatMessagesWidget.scrollTop = chatMessagesWidget.scrollHeight;
    }

    if (chatSendWidget) {
        chatSendWidget.addEventListener('click', (e) => {
            e.preventDefault();
            sendChatWidget();
        });
    }
    if (chatInputWidget) {
        chatInputWidget.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') {
                e.preventDefault();
                sendChatWidget();
            }
        });
    }

    // ---- STATUS ----
    async function checkStatus() {
        const dot = document.getElementById('status-dot');
        const text = document.getElementById('status-text');
        try {
            const r = await fetch(`${API_BASE}/status`);
            if (r.ok) {
                dot.style.background = '#16a34a';
                text.innerText = "Connecté";
            }
        } catch (e) {
            dot.style.background = '#ff4b4b';
            text.innerText = "Déconnecté";
        }
    }

    checkStatus();
    setInterval(checkStatus, 30000);

    // ---- SECRET TRIGGER FOR UPDATE BASE ----
    const updateBaseBtn = document.getElementById('update-db-btn');
    if (updateBaseBtn) {
        // Force hide with !important
        updateBaseBtn.style.setProperty('display', 'none', 'important');

        document.addEventListener('keydown', (e) => {
            if (e.ctrlKey && e.shiftKey && e.key.toLowerCase() === 'u') {
                e.preventDefault();
                const isHidden = window.getComputedStyle(updateBaseBtn).display === 'none';
                if (isHidden) {
                    updateBaseBtn.style.setProperty('display', 'flex', 'important');
                } else {
                    updateBaseBtn.style.setProperty('display', 'none', 'important');
                }
                console.log("🛠️ Admin Mode: Update Base Button Toggled.");
            }
        });
    }
});
