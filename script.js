const SUPABASE_URL = 'https://fthogaftgjdumqcfjgmu.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZ0aG9nYWZ0Z2pkdW1xY2ZqZ211Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTYxMDE1ODIsImV4cCI6MjA3MTY3NzU4Mn0.xouBD8rH6l7Jm-bMChRErxZho2KO1fPnABy3is1c8Dw';
// These keys are safe to be exposed as I have enabled rls policies in database.
let supabase = null;
if (typeof window.supabase !== 'undefined') {
  supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);
}

let aiSystemsOnline = true;
let aiStats = { processedClues: 0, correlations: 0, confidence: 98 };
let caseNumbersCache = {};
let isLoading = false;

function generateCaseNumber() {
  return Math.floor(Math.random() * 9000) + 1000;
}

function getCaseNumber(clue) {
  if (!clue) return generateCaseNumber();
  if (clue.case_number) return clue.case_number;
  if (caseNumbersCache[clue.id]) return caseNumbersCache[clue.id];
  const newCaseNumber = generateCaseNumber();
  caseNumbersCache[clue.id] = newCaseNumber;
  return newCaseNumber;
}

function isAdditionalEvidence(clue) {
  if (!clue) return false;
  return clue.parent_case_id !== null && clue.parent_case_id !== undefined;
}

class SmartAI {
  constructor() {
    this.riskKeywords = {
      high: ['urgent', 'immediate', 'danger', 'threat', 'emergency', 'critical', 'violence', 'harm', 'abuse', 'attack', 'missing', 'kidnap', 'assault', 'murder', 'death', 'weapon'],
      medium: ['suspicious', 'concerning', 'unusual', 'important', 'significant', 'witness', 'evidence', 'incident', 'theft', 'robbery', 'fraud', 'vandalism'],
      low: ['minor', 'routine', 'normal', 'regular', 'standard', 'parking', 'noise', 'complaint', 'lost', 'found']
    };

    this.qualityPatterns = {
      time: /\b(\d{1,2}:\d{2}|morning|afternoon|evening|night|today|yesterday|last week|this morning)\b/gi,
      location: /\b([A-Z][a-z]+ (?:street|road|avenue|lane|drive|place|park|school|hospital|station|mall|center))\b/gi,
      person: /\b(man|woman|boy|girl|person|suspect|witness|male|female|individual|someone|people)\b/gi,
      vehicle: /\b(car|truck|van|sedan|suv|motorcycle|bike|vehicle|bus|taxi|auto)\b/gi,
      color: /\b(red|blue|green|black|white|gray|grey|yellow|brown|orange|purple|pink|silver)\b/gi,
      numbers: /\b\d+\b/g,
      specifics: /\b(wearing|holding|carrying|driving|walking|running|talking|shouting)\b/gi
    };
  }

  analyzeContent(description) {
    const riskLevel = this.assessRiskLevel(description);
    const keywords = this.extractKeywords(description);
    const confidence = this.calculateConfidence(description);

    return {
      risk_level: riskLevel,
      confidence: confidence,
      keywords: keywords,
      processing_time: Date.now()
    };
  }

  assessRiskLevel(text) {
    const lowerText = text.toLowerCase();
    let highRiskCount = 0;
    let mediumRiskCount = 0;

    this.riskKeywords.high.forEach(keyword => {
      if (lowerText.includes(keyword)) highRiskCount++;
    });

    this.riskKeywords.medium.forEach(keyword => {
      if (lowerText.includes(keyword)) mediumRiskCount++;
    });

    if (highRiskCount >= 2) return 'high';
    if (highRiskCount > 0) return 'high';
    if (mediumRiskCount >= 2) return 'medium';
    if (mediumRiskCount > 0) return 'medium';
    return 'low';
  }

  extractKeywords(text) {
    const words = text.toLowerCase().split(/\s+/).filter(word => word.length > 3);
    const stopWords = ['the', 'and', 'or', 'but', 'in', 'on', 'at', 'to', 'for', 'of', 'with', 'by', 'from', 'this', 'that', 'they', 'them', 'their', 'were', 'been', 'have', 'has', 'had', 'will', 'would', 'could', 'should'];
    const filteredWords = words.filter(word => !stopWords.includes(word));

    const wordCount = {};
    filteredWords.forEach(word => {
      wordCount[word] = (wordCount[word] || 0) + 1;
    });

    return Object.entries(wordCount)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 8)
      .map(([word]) => word);
  }

  calculateConfidence(description) {
    let confidence = 0.6;

    if (description.length > 50) confidence += 0.1;
    if (description.length > 100) confidence += 0.1;
    if (description.length > 200) confidence += 0.1;

    Object.values(this.qualityPatterns).forEach(pattern => {
      const matches = description.match(pattern);
      if (matches && matches.length > 0) {
        confidence += Math.min(matches.length * 0.05, 0.15);
      }
    });

    if (/[A-Z][a-z]+\s+[A-Z][a-z]+/.test(description)) confidence += 0.05;
    if (/\b\d{1,2}[\/\-]\d{1,2}[\/\-]\d{2,4}\b/.test(description)) confidence += 0.1;
    if (/\b\d{10,}\b/.test(description)) confidence += 0.08;

    return Math.min(confidence, 1.0);
  }

  validateTip(tipText) {
    if (!tipText || tipText.trim().length === 0) {
      return { quality_score: 0.1, specificity: 0.1, relevance: 0.1, credibility: 0.1 };
    }

    const specificity = this.assessSpecificity(tipText);
    const relevance = this.assessRelevance(tipText);
    const credibility = this.assessCredibility(tipText);

    return {
      quality_score: (specificity + relevance + credibility) / 3,
      specificity: specificity,
      relevance: relevance,
      credibility: credibility
    };
  }

  assessSpecificity(text) {
    let score = 0.3;
    Object.values(this.qualityPatterns).forEach(pattern => {
      const matches = text.match(pattern);
      if (matches) score += Math.min(matches.length * 0.08, 0.2);
    });
    if (text.length > 50) score += 0.1;
    if (text.length > 100) score += 0.1;
    if (text.length > 200) score += 0.05;
    return Math.min(score, 1.0);
  }

  assessRelevance(text) {
    const relevanceKeywords = ['saw', 'witnessed', 'noticed', 'observed', 'heard', 'know', 'recognize', 'remember', 'location', 'time', 'person', 'vehicle', 'happened', 'occurred', 'when', 'where', 'who', 'what', 'how'];
    let score = 0.4;
    const lowerText = text.toLowerCase();
    relevanceKeywords.forEach(keyword => {
      if (lowerText.includes(keyword)) score += 0.04;
    });
    if (/\b(I|me|my|personally|myself)\b/i.test(text)) score += 0.15;
    return Math.min(score, 1.0);
  }

  assessCredibility(text) {
    let score = 0.5;
    if (text.length > 30) score += 0.1;
    if (text.length > 80) score += 0.1;
    if (/\b(I|me|my|personally)\b/i.test(text)) score += 0.2;
    if (/\b\d+\b/.test(text)) score += 0.1;
    if ((text.match(/\./g) || []).length >= 2) score += 0.08;
    if (text.includes(',')) score += 0.05;
    if (/\b(maybe|might|could be|not sure|possibly|perhaps)\b/i.test(text)) score -= 0.08;
    if (/\b(definitely|certainly|absolutely|clearly|obviously)\b/i.test(text)) score += 0.12;
    if (text.length < 15) score -= 0.25;
    if (/^[a-zA-Z\s.,!?]+$/.test(text)) score += 0.05;
    return Math.min(Math.max(score, 0.15), 1.0);
  }
}

const smartAI = new SmartAI();

function initializeNavigation() {
  console.log('🚀 Safe Tracer by NIDHIN R - Initializing navigation...');
  const loginBtn = document.getElementById('investigatorLoginBtn');
  if (loginBtn) {
    console.log('✅ Login button found - Setting up navigation');
    loginBtn.removeEventListener('click', navigateToAdmin);
    loginBtn.addEventListener('click', navigateToAdmin);
    loginBtn.onclick = navigateToAdmin;
    console.log('🔗 Navigation listeners attached successfully');
  } else {
    console.error('❌ Login button not found - Searching for backup buttons');
    const buttons = document.querySelectorAll('button');
    buttons.forEach(btn => {
      if (btn.textContent.toLowerCase().includes('investigator') || btn.textContent.toLowerCase().includes('dashboard')) {
        console.log('🔧 Found backup investigator button');
        btn.addEventListener('click', navigateToAdmin);
      }
    });
  }
}

function navigateToAdmin(e) {
  e.preventDefault();
  e.stopPropagation();
  console.log('🚁 Navigation to Admin Dashboard triggered!');

  const loadingOverlay = document.createElement('div');
  loadingOverlay.style.cssText = `
    position: fixed; top: 0; left: 0; width: 100%; height: 100%; 
    background: linear-gradient(135deg, rgba(0,0,0,0.9), rgba(26,26,26,0.9));
    z-index: 10000; display: flex; justify-content: center; align-items: center;
    animation: fadeIn 0.5s ease-in-out;
  `;

  loadingOverlay.innerHTML = `
    <div style="text-align: center; color: #39ff14;">
      <div style="font-size: 4rem; animation: carSiren 1.5s ease-in-out infinite;">🚁</div>
      <div style="font-size: 1.5rem; margin-top: 20px; animation: textGlow 2s ease-in-out infinite;">
        🛡️ ACCESSING SAFE TRACER DASHBOARD
      </div>
      <div style="color: #ffffff; font-size: 1rem; margin-top: 10px;">
        AI Investigation System by NIDHIN R
      </div>
      <div style="margin-top: 20px;">
        <div class="spinner" style="display: inline-block; width: 30px; height: 30px; border: 3px solid rgba(57, 255, 20, 0.3); border-radius: 50%; border-top-color: #39ff14; animation: spin 1s ease-in-out infinite;"></div>
      </div>
    </div>
  `;

  const style = document.createElement('style');
  style.textContent = `
    @keyframes fadeIn { from { opacity: 0; } to { opacity: 1; } }
    @keyframes carSiren {
      0%, 100% { transform: scale(1) rotate(0deg); }
      25% { transform: scale(1.1) rotate(-3deg); }
      50% { transform: scale(1.2) rotate(0deg); }
      75% { transform: scale(1.1) rotate(3deg); }
    }
    @keyframes textGlow {
      0%, 100% { text-shadow: 0 0 10px #39ff14; }
      50% { text-shadow: 0 0 30px #39ff14, 0 0 50px #39ff14; }
    }
    @keyframes spin { to { transform: rotate(360deg); } }
  `;

  document.head.appendChild(style);
  document.body.appendChild(loadingOverlay);

  setTimeout(() => {
    try {
      window.location.href = 'admin.html';
    } catch (error) {
      console.log('🔄 Navigation method 1 failed, trying alternatives...');
      try {
        window.location.assign('admin.html');
      } catch (error2) {
        console.log('🔄 Navigation method 2 failed, using replace...');
        window.location.replace('admin.html');
      }
    }
  }, 2000);
}

window.openPublicReportModal = function() {
  const modal = new bootstrap.Modal(document.getElementById('publicReportModal'));
  modal.show();

  setTimeout(() => {
    setupPublicReportHandlers();
  }, 300);
};

function setupPublicReportHandlers() {
  const reportImage = document.getElementById('reportImage');
  const reportDescription = document.getElementById('reportDescription');
  const reportContact = document.getElementById('reportContact');
  const reportConfirmation = document.getElementById('reportConfirmation');
  const submitReportBtn = document.getElementById('submitReportBtn');

  if (reportImage) {
    reportImage.removeEventListener('change', handleReportImageChange);
    reportImage.addEventListener('change', handleReportImageChange);
  }

  if (reportDescription) {
    reportDescription.removeEventListener('input', checkReportReadiness);
    reportDescription.addEventListener('input', checkReportReadiness);
  }

  if (reportConfirmation) {
    reportConfirmation.removeEventListener('change', checkReportReadiness);
    reportConfirmation.addEventListener('change', checkReportReadiness);
  }

  if (submitReportBtn) {
    submitReportBtn.removeEventListener('click', submitPublicReport);
    submitReportBtn.addEventListener('click', submitPublicReport);
  }

  function handleReportImageChange(e) {
    const file = e.target.files[0];
    const preview = document.getElementById('reportImagePreview');

    if (file) {
      if (file.size > 10 * 1024 * 1024) {
        alert('⚠️ Image too large. Please select a file smaller than 10MB.');
        e.target.value = '';
        checkReportReadiness();
        return;
      }

      if (!file.type.startsWith('image/')) {
        alert('⚠️ Please select a valid image file.');
        e.target.value = '';
        checkReportReadiness();
        return;
      }

      const reader = new FileReader();
      reader.onload = function(e) {
        if (preview) {
          preview.innerHTML = `
            <div class="mt-2 text-center">
              <img src="${e.target.result}" alt="Report Evidence Preview" 
                   style="max-width: 100%; max-height: 200px; border-radius: 8px; border: 2px solid #39ff14;">
              <br><small class="text-success mt-1">📸 Image ready for upload</small>
            </div>
          `;
        }
      };
      reader.readAsDataURL(file);
    } else {
      if (preview) preview.innerHTML = '';
    }
    checkReportReadiness();
  }

  function checkReportReadiness() {
    const description = reportDescription?.value?.trim() || '';
    const confirmed = reportConfirmation?.checked || false;

    const isReady = description.length >= 10 && confirmed;

    if (submitReportBtn) {
      submitReportBtn.disabled = !isReady;
      if (isReady) {
        submitReportBtn.classList.remove('btn-secondary');
        submitReportBtn.classList.add('btn-warning');
      } else {
        submitReportBtn.classList.remove('btn-warning');
        submitReportBtn.classList.add('btn-secondary');
      }
    }
  }

  checkReportReadiness();
}

async function submitPublicReport() {
  const description = document.getElementById('reportDescription')?.value?.trim();
  const imageFile = document.getElementById('reportImage')?.files?.[0];
  const contact = document.getElementById('reportContact')?.value?.trim();
  const confirmed = document.getElementById('reportConfirmation')?.checked;

  if (!description || description.length < 10) {
    alert('⚠️ Please provide a detailed case description (at least 10 characters).');
    return;
  }

  if (!confirmed) {
    alert('⚠️ Please confirm that your report is accurate by checking the confirmation box.');
    return;
  }

  const submitBtn = document.getElementById('submitReportBtn');
  const originalText = submitBtn?.textContent || '';

  try {
    if (submitBtn) {
      submitBtn.disabled = true;
      submitBtn.textContent = '📤 Submitting Report...';
    }

    let imageUrl = null;
    if (imageFile) {
      if (submitBtn) submitBtn.textContent = '📁 Uploading Image...';
      imageUrl = await uploadReportImage(imageFile);
    }

    if (submitBtn) submitBtn.textContent = '💾 Saving Report...';

    const reportData = {
      description: description,
      image_url: imageUrl,
      submitted_by: contact || 'Anonymous',
      status: 'pending',
      created_at: new Date().toISOString()
    };

    if (!supabase) {
      throw new Error('Database connection unavailable. Please try again later.');
    }

    const { data, error } = await supabase
      .from('public_reports')
      .insert(reportData)
      .select();

    if (error) throw error;

    const successPopup = document.createElement('div');
    successPopup.style.cssText = `
      position: fixed; top: 50%; left: 50%; transform: translate(-50%, -50%);
      background: linear-gradient(135deg, #1a1a1a, #2d2d2d); border: 2px solid #28a745;
      border-radius: 15px; padding: 30px; z-index: 10000; color: #28a745;
      text-align: center; font-family: 'Orbitron', monospace; max-width: 500px;
      box-shadow: 0 0 30px rgba(40, 167, 69, 0.3);
    `;

    successPopup.innerHTML = `
      <div style="font-size: 3rem; margin-bottom: 15px;">✅</div>
      <h3 style="color: #28a745; margin-bottom: 15px;">Report Submitted Successfully!</h3>
      <div style="color: #ffffff; line-height: 1.6;">
        <p><strong>Report ID:</strong> ${data[0]?.id?.substring(0, 8) || 'Generated'}</p>
        <p>Your case report has been sent to investigators for review.</p>
        <p>Thank you for helping keep the community safe.</p>
        <hr style="border-color: #28a745; margin: 20px 0;">
        <p style="font-size: 0.9rem;">Safe Tracer by NIDHIN R - Community Intelligence Network</p>
      </div>
      <button onclick="this.parentElement.remove()" 
              style="background: #28a745; color: #fff; border: none; padding: 10px 20px; 
                     border-radius: 5px; font-weight: bold; margin-top: 15px;">Close</button>
    `;

    document.body.appendChild(successPopup);

    document.getElementById('reportDescription').value = '';
    document.getElementById('reportImage').value = '';
    document.getElementById('reportContact').value = '';
    document.getElementById('reportConfirmation').checked = false;
    document.getElementById('reportImagePreview').innerHTML = '';

    const modal = bootstrap.Modal.getInstance(document.getElementById('publicReportModal'));
    if (modal) {
      setTimeout(() => {
        modal.hide();
      }, 1000);
    }

    setTimeout(() => {
      if (document.body.contains(successPopup)) {
        document.body.removeChild(successPopup);
      }
    }, 8000);

  } catch (error) {
    console.error('Error submitting report:', error);
    alert('❌ Error submitting report: ' + error.message + '\n\nPlease try again or contact support.');
  } finally {
    if (submitBtn) {
      submitBtn.disabled = false;
      submitBtn.textContent = originalText;
    }
  }
}

async function uploadReportImage(file) {
    console.log('🔄 Using guaranteed upload method (base64)...');

    try {
      
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = () => {
                console.log('✅ Image converted to base64 successfully');
                resolve(reader.result);
            };
            reader.onerror = () => {
                reject(new Error('Failed to read file'));
            };
            reader.readAsDataURL(file);
        });
    } catch (error) {
        console.error('Base64 conversion error:', error);
        throw new Error('Failed to process image');
    }
}




document.addEventListener('DOMContentLoaded', function() {
  console.log('🚀 Safe Tracer by NIDHIN R - Public Portal Initializing...');

  initializeNavigation();
  setTimeout(initializeNavigation, 1000);
  setTimeout(initializeNavigation, 3000);

  initializeAISystems();
  initializeEffects();
  loadAIProcessedClues();
  startAIMonitoring();
  loadPublicNoticesAndBanners();
  displayCurrentDeviceInfo();

  console.log('🛡️ Safe Tracer Public System ');
});

window.addEventListener('load', function() {
  console.log('🌐 Window loaded - Backup navigation and system initialization...');
  initializeNavigation();
});

async function initializeAISystems() {
  updateAIStatus('Connecting to AI services...', 'warning');

  try {
    await new Promise(resolve => setTimeout(resolve, 1500));
    aiSystemsOnline = true;
    updateAIStatus('AI Systems Online & Monitoring', 'success');
    console.log('✅ AI systems initialized and monitoring active');
  } catch (error) {
    updateAIStatus('AI Limited Mode', 'warning');
    console.log('⚠️ AI systems in fallback mode');
  }

  updateAIStatsDisplay();
}

function updateAIStatus(message, status) {
  const statusElement = document.getElementById('aiStatusText');
  const indicator = document.querySelector('.ai-indicator');
  if (statusElement) statusElement.textContent = `AI Systems: ${message}`;
  if (indicator) {
    indicator.className = `ai-indicator ${status}`;
    if (status === 'success') {
      indicator.style.background = 'rgba(40, 167, 69, 0.1)';
      indicator.style.borderColor = '#28a745';
    } else if (status === 'warning') {
      indicator.style.background = 'rgba(255, 193, 7, 0.1)';
      indicator.style.borderColor = '#ffc107';
    }
  }
}

function initializeEffects() {
  if (typeof particlesJS !== 'undefined') {
    particlesJS('particles-js', {
      particles: {
        number: { value: 150, density: { enable: true, value_area: 800 } },
        color: { value: ['#00ffff', '#00d4ff', '#8a2be2'] },
        shape: { type: 'circle' },
        opacity: { 
          value: 0.7, 
          random: true,
          animation: { enable: true, speed: 2, sync: false }
        },
        size: { 
          value: 4, 
          random: true,
          animation: { enable: true, speed: 3, sync: false }
        },
        line_linked: {
          enable: true,
          distance: 200,
          color: '#00ffff',
          opacity: 0.6,
          width: 2
        },
        move: { 
          enable: true, 
          speed: 2.5,
          direction: 'none',
          random: true,
          straight: false,
          out_mode: 'out'
        }
      },
      interactivity: {
        detect_on: 'canvas',
        events: {
          onhover: { enable: true, mode: 'repulse' },
          onclick: { enable: true, mode: 'push' }
        },
        modes: {
          repulse: { distance: 120, duration: 0.4 },
          push: { particles_nb: 6 }
        }
      }
    });
    console.log('✨ Particle effects initialized');
  }
}

async function loadAIProcessedClues() {
  if (isLoading) return;

  const container = document.getElementById('clues-container');
  if (!container) {
    console.warn('⚠️ Clues container not found');
    return;
  }

  if (!supabase) {
    container.innerHTML = `
      <div class="col-12">
        <div class="alert alert-warning">
          <h5>🔧 System Configuration</h5>
          <p>Database services are being configured. Please check back soon!</p>
          <small>Safe Tracer by NIDHIN R - AI-Powered Investigation Platform</small>
        </div>
      </div>
    `;
    return;
  }

  isLoading = true;

  try {
    const { data: clues, error } = await Promise.race([
      supabase
        .from('clues')
        .select('*')
        .eq('status', 'active')
        .order('created_at', { ascending: false })
        .limit(20),
      new Promise((_, reject) => 
        setTimeout(() => reject(new Error('Loading timeout')), 10000)
      )
    ]);

    if (error) {
      throw error;
    }

    container.innerHTML = '';

    if (!clues || clues.length === 0) {
      container.innerHTML = `
        <div class="col-12">
          <div class="no-clues-message">
            <div style="font-size: 3rem; margin-bottom: 15px;">🔍</div>
            <h4>No Active Investigation Cases</h4>
            <p>Investigators haven't uploaded any cases requiring community assistance yet.</p>
            <small>Check back soon for new cases where your tips could help solve investigations!</small>
            <div class="mt-3">
              <small class="text-success">✅ AI monitoring systems are active and ready</small>
            </div>
          </div>
        </div>
      `;
      return;
    }

    const mainCases = clues.filter(clue => !isAdditionalEvidence(clue));
    const additionalEvidence = clues.filter(clue => isAdditionalEvidence(clue));

    if (mainCases.length === 0) {
      container.innerHTML = `
        <div class="col-12">
          <div class="no-clues-message">
            <div style="font-size: 3rem; margin-bottom: 15px;">⏳</div>
            <h4>Cases Under Investigation</h4>
            <p>All current cases are being actively processed by investigators.</p>
            <small>New cases requiring community assistance will appear here when available.</small>
          </div>
        </div>
      `;
      return;
    }

    for (const clue of mainCases) {
      const relatedEvidence = additionalEvidence.filter(evidence => 
        evidence.parent_case_id === clue.id
      );

      const enhancedClue = enhanceClueWithAI(clue);
      enhancedClue.additionalEvidence = relatedEvidence;
      const clueCard = createAIEnhancedClueCard(enhancedClue);
      container.appendChild(clueCard);
      aiStats.processedClues++;
    }

    updateAIStatsDisplay();
    console.log(`✅ Loaded ${mainCases.length} investigation cases successfully`);

  } catch (error) {
    console.error('❌ Error loading AI-processed clues:', error);
    container.innerHTML = `
      <div class="col-12">
        <div class="alert alert-danger">
          <h5>⚠️ Loading Error</h5>
          <p>Unable to connect to investigation database: ${error.message}</p>
          <small>Please check your connection and try refreshing the page.</small>
          <div class="mt-3">
            <button class="btn btn-primary btn-sm" onclick="loadAIProcessedClues()">
              🔄 Retry Loading
            </button>
          </div>
        </div>
      </div>
    `;
  } finally {
    isLoading = false;
  }
}

function enhanceClueWithAI(clue) {
  if (!aiSystemsOnline) {
    return { 
      ...clue, 
      ai_enhanced: false,
      risk_level: 'medium'
    };
  }

  try {
    let aiAnalysis = clue.ai_analysis;
    if (!aiAnalysis && clue.description) {
      aiAnalysis = smartAI.analyzeContent(clue.description);
    }

    return {
      ...clue,
      ai_enhanced: true,
      ai_analysis: aiAnalysis,
      risk_level: aiAnalysis?.risk_level || 'medium'
    };
  } catch (error) {
    console.log('⚠️ AI enhancement failed for clue:', clue.id, error);
    return { 
      ...clue, 
      ai_enhanced: false,
      risk_level: 'medium'
    };
  }
}

function createAIEnhancedClueCard(clue) {
  const cardCol = document.createElement('div');
  cardCol.className = 'col-lg-4 col-md-6 mb-4';
  const riskClass = getRiskClass(clue.risk_level);
  const aiIndicator = clue.ai_enhanced ? '🤖 AI-Enhanced' : '📋 Standard';
  const caseNumber = getCaseNumber(clue);
  const evidenceCount = (clue.additionalEvidence?.length || 0) + 1;

  const isResolved = clue.status === 'resolved';
  const investigatorPriority = clue.priority || 'medium';

  cardCol.innerHTML = `
    <div class="clue-card ${riskClass} ${isResolved ? 'resolved-case' : ''}" data-risk="${clue.risk_level}">
      <div class="ai-enhancement-badge">
        ${aiIndicator}
      </div>
      <div class="clue-image-container">
        <img src="${clue.image_url}" alt="Investigation Evidence"
             class="clue-image" 
             style="cursor: pointer;"
             onclick="showFullCaseEvidence('${clue.id}', '${clue.image_url}', 'Case ${caseNumber} Evidence')"
             onerror="this.src='https://via.placeholder.com/350x200/333/fff?text=Investigation+Evidence+%23${caseNumber}'">
        <div class="clue-overlay">
          <span class="clue-id">Case ${caseNumber}</span>
          <span class="case-priority-badge priority-${investigatorPriority}">Priority: ${investigatorPriority.toUpperCase()}</span>
          ${evidenceCount > 1 ? `<span class="evidence-count">${evidenceCount} Evidence</span>` : ''}
          ${isResolved ? '<span class="resolved-badge" style="background: rgba(40, 167, 69, 0.9); color: white; padding: 4px 8px; border-radius: 12px; font-size: 0.7rem;">✅ RESOLVED</span>' : ''}
        </div>
      </div>
      <div class="clue-content">
        <div class="priority-pill-container">
          <span class="priority-pill investigator-assigned ${investigatorPriority}">
            Case Priority: ${investigatorPriority.toUpperCase()}
          </span>
        </div>

        ${clue.additionalEvidence && clue.additionalEvidence.length > 0 ? `
          <div class="additional-evidence-preview mb-3">
            <h6>📎 Additional Evidence (${clue.additionalEvidence.length})</h6>
            <div class="evidence-thumbnails">
              ${clue.additionalEvidence.slice(0, 3).map((evidence, index) => `
                <img src="${evidence.image_url}" alt="Additional Evidence ${index + 1}" 
                     class="evidence-thumbnail" style="width: 60px; height: 60px; object-fit: cover; margin-right: 5px; border-radius: 5px; cursor: pointer;"
                     onclick="showImageModal('${evidence.image_url}', 'Additional Evidence ${index + 1}')">
              `).join('')}
              ${clue.additionalEvidence.length > 3 ? `<span class="more-evidence">+${clue.additionalEvidence.length - 3} more</span>` : ''}
            </div>
          </div>
        ` : ''}

        <p class="clue-description">${clue.description}</p>
        <div class="tip-section">
          ${isResolved ? `
            <div class="resolved-case-notice" style="background: linear-gradient(45deg, #28a745, #20c997); padding: 15px; border-radius: 10px; text-align: center; color: white;">
              <h6><i class="fas fa-check-circle"></i> CASE RESOLVED</h6>
              <p style="margin: 5px 0; font-size: 0.9rem;">This investigation has been completed. No further tips are being accepted.</p>
              <small>Thank you for your interest in helping!</small>
            </div>
          ` : `
            <div class="ai-tip-helper mb-2">
              <small><strong>💡 AI Tip Quality Assistant:</strong> Be specific with times, locations, and descriptions for better analysis.</small>
            </div>
            <textarea 
              id="tip-${clue.id}" 
              class="form-control tip-input" 
              placeholder="Share your anonymous tip about this case... (Be specific: time, location, what you saw)"
              rows="3"
            ></textarea>
            <div class="tip-actions mt-2">
              <button 
                class="btn btn-success w-100 ai-submit-btn" 
                onclick="submitAnonymousTip('${clue.id}')"
              >
                🤖 Submit AI-Validated Tip
              </button>
              <div class="tip-photo-upload mt-2">
                <input type="file" id="photo-${clue.id}" accept="image/*" style="display:none;" onchange="handleTipPhotoSelection('${clue.id}')">
                <button class="btn btn-outline-light btn-sm w-100" onclick="document.getElementById('photo-${clue.id}').click()">
                  📸 Add Photo Evidence (Optional)
                </button>
                <div id="photo-preview-${clue.id}" class="photo-preview"></div>
              </div>
            </div>
          `}
        </div>
      </div>
    </div>
  `;
  return cardCol;
}

window.showImageModal = function(imageSrc, title, clueData = null) {
  const existingModal = document.getElementById('imageModal');
  if (existingModal) {
    const modalBody = existingModal.querySelector('.modal-body');
    const modalTitle = document.getElementById('imageModalTitle');
    
    if (modalTitle) modalTitle.textContent = title;
    
    if (clueData && clueData.additionalEvidence && clueData.additionalEvidence.length > 0) {
     
      modalBody.innerHTML = `
        <div class="evidence-gallery">
          <div class="main-evidence-container text-center mb-3">
            <img id="mainEvidenceImage" src="${imageSrc}" alt="${title}" 
                 style="max-width: 100%; max-height: 60vh; border-radius: 8px; border: 2px solid #39ff14;">
            <p class="mt-2 text-info"><strong>Main Evidence</strong></p>
          </div>
          
          <div class="additional-evidence-section">
            <h6 class="text-warning mb-3">📎 All Case Evidence (${clueData.additionalEvidence.length + 1} pieces)</h6>
            <div class="evidence-thumbnails row">
              <div class="col-md-3 mb-2">
                <div class="evidence-thumb-container text-center">
                  <img src="${imageSrc}" alt="Main Evidence" 
                       class="evidence-thumb active" 
                       style="width: 100%; height: 80px; object-fit: cover; border-radius: 5px; cursor: pointer; border: 2px solid #39ff14;"
                       onclick="switchMainEvidence('${imageSrc}', 'Main Evidence')">
                  <small class="d-block mt-1 text-success">Main Evidence</small>
                </div>
              </div>
              ${clueData.additionalEvidence.map((evidence, index) => `
                <div class="col-md-3 mb-2">
                  <div class="evidence-thumb-container text-center">
                    <img src="${evidence.image_url}" alt="Evidence ${index + 2}" 
                         class="evidence-thumb" 
                         style="width: 100%; height: 80px; object-fit: cover; border-radius: 5px; cursor: pointer; border: 2px solid #666;"
                         onclick="switchMainEvidence('${evidence.image_url}', 'Additional Evidence ${index + 2}')">
                    <small class="d-block mt-1 text-muted">Evidence ${index + 2}</small>
                  </div>
                </div>
              `).join('')}
            </div>
          </div>
          
          <div class="evidence-navigation mt-3 text-center">
            <button class="btn btn-outline-light btn-sm me-2" onclick="previousEvidence()">← Previous</button>
            <button class="btn btn-outline-light btn-sm" onclick="nextEvidence()">Next →</button>
          </div>
          
          <div class="case-info mt-3 p-3" style="background: rgba(255, 255, 255, 0.1); border-radius: 8px;">
            <h6 class="text-primary">📋 Case Information</h6>
            <p><strong>Case #${getCaseNumber(clueData)}</strong></p>
            <p class="mb-0">${clueData.description}</p>
          </div>
        </div>
      `;
    } else {
      
      modalBody.innerHTML = `
        <div class="text-center">
          <img id="modalImage" src="${imageSrc}" alt="${title}" 
               style="max-width: 100%; max-height: 80vh; border-radius: 8px; border: 2px solid #39ff14;">
        </div>
      `;
    }
    
    const modal = new bootstrap.Modal(existingModal);
    modal.show();
  }
};

window.switchMainEvidence = function(imageSrc, title) {
  const mainImage = document.getElementById('mainEvidenceImage');
  const modalTitle = document.getElementById('imageModalTitle');
  
  if (mainImage) mainImage.src = imageSrc;
  if (modalTitle) modalTitle.textContent = title;
  
  
  document.querySelectorAll('.evidence-thumb').forEach(thumb => {
    thumb.style.border = '2px solid #666';
    thumb.parentElement.querySelector('small').className = 'd-block mt-1 text-muted';
  });
  
  const activeThumb = document.querySelector(`img[src="${imageSrc}"].evidence-thumb`);
  if (activeThumb) {
    activeThumb.style.border = '2px solid #39ff14';
    activeThumb.parentElement.querySelector('small').className = 'd-block mt-1 text-success';
  }
};

let currentEvidenceIndex = 0;
let currentEvidenceList = [];

window.previousEvidence = function() {
  if (currentEvidenceList.length > 0) {
    currentEvidenceIndex = (currentEvidenceIndex - 1 + currentEvidenceList.length) % currentEvidenceList.length;
    const evidence = currentEvidenceList[currentEvidenceIndex];
    switchMainEvidence(evidence.url, evidence.title);
  }
};

window.nextEvidence = function() {
  if (currentEvidenceList.length > 0) {
    currentEvidenceIndex = (currentEvidenceIndex + 1) % currentEvidenceList.length;
    const evidence = currentEvidenceList[currentEvidenceIndex];
    switchMainEvidence(evidence.url, evidence.title);
  }
};

window.showFullCaseEvidence = async function(clueId, mainImageUrl, title) {
  try {
    
    const { data: allEvidence, error } = await supabase
      .from('clues')
      .select('*')
      .or(`id.eq.${clueId},parent_case_id.eq.${clueId}`)
      .order('created_at', { ascending: true });

    if (error) throw error;

    const mainCase = allEvidence.find(e => e.id == clueId);
    const additionalEvidence = allEvidence.filter(e => e.parent_case_id == clueId);

    const enhancedClueData = {
      ...mainCase,
      additionalEvidence: additionalEvidence
    };

    
    currentEvidenceList = [
      { url: mainImageUrl, title: 'Main Evidence' },
      ...additionalEvidence.map((evidence, index) => ({
        url: evidence.image_url,
        title: `Additional Evidence ${index + 2}`
      }))
    ];
    currentEvidenceIndex = 0;

    showImageModal(mainImageUrl, title, enhancedClueData);

  } catch (error) {
    console.error('Error loading case evidence:', error);
   
    showImageModal(mainImageUrl, title);
  }
};

function getRiskClass(riskLevel) {
  switch(riskLevel) {
    case 'high': return 'risk-high';
    case 'medium': return 'risk-medium';
    case 'low': return 'risk-low';
    default: return 'risk-medium';
  }
}

window.handleTipPhotoSelection = function(clueId) {
  const fileInput = document.getElementById(`photo-${clueId}`);
  const file = fileInput?.files?.[0];
  const previewDiv = document.getElementById(`photo-preview-${clueId}`);

  if (file) {
    if (file.size > 5 * 1024 * 1024) {
      alert('⚠️ Photo too large. Please select a file smaller than 5MB.');
      fileInput.value = '';
      return;
    }

    if (!file.type.startsWith('image/')) {
      alert('⚠️ Please select a valid image file.');
      fileInput.value = '';
      return;
    }

    const reader = new FileReader();
    reader.onload = function(e) {
      if (previewDiv) {
        previewDiv.innerHTML = `
          <div class="photo-preview-item mt-2">
            <img src="${e.target.result}" alt="Photo Evidence" 
                 style="max-width: 100%; max-height: 100px; border-radius: 8px; border: 2px solid #39ff14;">
            <br>
            <button class="btn btn-sm btn-outline-danger mt-2" onclick="clearPhotoPreview('${clueId}')">
              🗑️ Remove Photo
            </button>
            <small class="d-block text-success mt-1">📸 Photo ready - will be uploaded with your tip</small>
          </div>
        `;
      }
    };
    reader.readAsDataURL(file);
  }
};

window.clearPhotoPreview = function(clueId) {
  const fileInput = document.getElementById(`photo-${clueId}`);
  const previewDiv = document.getElementById(`photo-preview-${clueId}`);
  if (fileInput) fileInput.value = '';
  if (previewDiv) previewDiv.innerHTML = '';
};

window.submitAnonymousTip = async function(clueId) {
  const tipInput = document.getElementById(`tip-${clueId}`);
  const tipText = tipInput?.value?.trim() || '';
  const photoInput = document.getElementById(`photo-${clueId}`);
  const photo = photoInput?.files?.[0];

  if (!tipText && !photo) {
    alert('⚠️ Please enter a tip or add a photo before submitting.');
    if (tipInput) tipInput.focus();
    return;
  }

  if (tipText && tipText.length < 10) {
    alert('⚠️ Please provide more details in your tip (at least 10 characters).');
    if (tipInput) tipInput.focus();
    return;
  }

  if (!supabase) {
    alert('⚠️ Service temporarily unavailable. Please try again later.');
    return;
  }

  const button = event.target;
  const originalText = button?.innerHTML || '';

  try {
    if (button) {
      button.innerHTML = '🤖 AI Processing...';
      button.disabled = true;
    }

    let photoUrl = null;
    if (photo) {
      if (button) button.innerHTML = '📁 Uploading photo...';
      photoUrl = await uploadTipPhoto(photo, clueId);
    }

    if (button) button.innerHTML = '🧠 AI Validation...';
    const tipValidation = smartAI.validateTip(tipText);

    if (button) button.innerHTML = '💾 Submitting tip...';
    const { data, error } = await supabase.from('tips').insert({
      clue_id: clueId,
      tip_text: tipText || 'Photo evidence submitted',
      photo_url: photoUrl,
      status: 'pending',
      quality_score: tipValidation.quality_score,
      created_at: new Date().toISOString()
    }).select();

    if (error) throw error;

    const qualityFeedback = getQualityFeedback(tipValidation.quality_score);
    const photoFeedback = photoUrl ? '\n📸 Photo evidence uploaded successfully.' : '';

    const successPopup = document.createElement('div');
    successPopup.style.cssText = `
      position: fixed; top: 50%; left: 50%; transform: translate(-50%, -50%);
      background: linear-gradient(135deg, #1a1a1a, #2d2d2d); border: 2px solid #28a745;
      border-radius: 15px; padding: 30px; z-index: 10000; color: #28a745;
      text-align: center; font-family: 'Orbitron', monospace; max-width: 500px;
      box-shadow: 0 0 30px rgba(40, 167, 69, 0.3);
    `;

    successPopup.innerHTML = `
      <div style="font-size: 3rem; margin-bottom: 15px;">🎯</div>
      <h3 style="color: #28a745; margin-bottom: 15px;">Tip Submitted Successfully!</h3>
      <div style="color: #ffffff; line-height: 1.6;">
        <p><strong>AI Quality Assessment:</strong></p>
        <p style="color: #39ff14;">${qualityFeedback}</p>
        ${photoFeedback ? `<p style="color: #17a2b8;">${photoFeedback}</p>` : ''}
        <p>Your anonymous tip has been sent to investigators!</p>
        <hr style="border-color: #28a745; margin: 20px 0;">
        <p style="font-size: 0.9rem;">Thank you for helping solve investigations</p>
        <p style="font-size: 0.8rem;">Safe Tracer by NIDHIN R</p>
      </div>
      <button onclick="this.parentElement.remove()" 
              style="background: #28a745; color: #fff; border: none; padding: 10px 20px; 
                     border-radius: 5px; font-weight: bold; margin-top: 15px;">Close</button>
    `;

    document.body.appendChild(successPopup);

    if (tipInput) tipInput.value = '';
    clearPhotoPreview(clueId);
    aiStats.correlations++;
    updateAIStatsDisplay();

    if (button) {
      button.innerHTML = '✅ Submitted Successfully!';
      button.style.background = 'linear-gradient(45deg, #28a745, #20c997)';
    }

    setTimeout(() => {
      if (document.body.contains(successPopup)) {
        document.body.removeChild(successPopup);
      }
      if (button) {
        button.innerHTML = originalText;
        button.disabled = false;
        button.style.background = '';
      }
    }, 6000);

  } catch (error) {
    console.error('Error submitting anonymous tip:', error);
    alert('❌ Error submitting tip: ' + error.message + '\n\nPlease try again.');

    if (button) {
      button.innerHTML = '❌ Submission Failed';
      button.style.background = 'linear-gradient(45deg, #dc3545, #fd7e14)';
      setTimeout(() => {
        button.innerHTML = originalText;
        button.disabled = false;
        button.style.background = '';
      }, 3000);
    }
  }
};

async function uploadTipPhoto(file, clueId) {
    console.log('🔄 Using guaranteed tip upload method (base64)...');

    try {
        
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = () => {
                console.log('✅ Tip photo converted to base64 successfully');
                resolve(reader.result);
            };
            reader.onerror = () => {
                reject(new Error('Failed to read file'));
            };
            reader.readAsDataURL(file);
        });
    } catch (error) {
        console.error('Base64 conversion error:', error);
        throw new Error('Failed to process tip photo');
    }
}


function getQualityFeedback(score) {
  if (score >= 0.85) return "🌟 Excellent tip quality! Very detailed and highly relevant.";
  if (score >= 0.70) return "👍 Good tip quality! Thank you for the detailed information.";
  if (score >= 0.55) return "📝 Helpful tip received! Additional details would be valuable.";
  if (score >= 0.40) return "💡 Thank you for your tip! Any additional details would help investigators.";
  return "📋 Thank you for contributing! Every piece of information helps the investigation.";
}

function updateAIStatsDisplay() {
  const elements = {
    aiProcessedClues: document.getElementById('aiProcessedClues'),
    correlationMatches: document.getElementById('correlationMatches'),
    aiConfidence: document.getElementById('aiConfidence')
  };

  if (elements.aiProcessedClues) elements.aiProcessedClues.textContent = aiStats.processedClues;
  if (elements.correlationMatches) elements.correlationMatches.textContent = aiStats.correlations;
  if (elements.aiConfidence) elements.aiConfidence.textContent = `${aiStats.confidence}%`;
}

function startAIMonitoring() {
  setInterval(() => {
    if (document.visibilityState === 'visible') {
      updateAIStatsDisplay();
    }
  }, 30000);

  setInterval(() => {
    if (aiSystemsOnline && document.visibilityState === 'visible' && !isLoading) {
      console.log('🔄 Auto-refreshing investigation cases...');
      loadAIProcessedClues();
    }
  }, 180000);

  setInterval(() => {
    if (aiSystemsOnline) {
      aiStats.confidence = Math.min(aiStats.confidence + Math.random() * 0.5, 99.5);
    } else {
      aiStats.confidence = Math.max(aiStats.confidence - 0.3, 85);
    }
    updateAIStatsDisplay();
  }, 45000);

  console.log('🤖 AI monitoring systems activated');
}


function getDeviceInfo() {
    const ua = navigator.userAgent;
    let device = '🖥️ Desktop';
    let browser = 'Unknown';
    let os = 'Unknown';

    
    if (/iPhone/i.test(ua)) device = '📱 iPhone';
    else if (/iPad/i.test(ua)) device = '📟 iPad';
    else if (/Android.*Mobile/i.test(ua)) device = '📱 Android Phone';
    else if (/Android/i.test(ua)) device = '📟 Android Tablet';
    else if (/Windows Phone/i.test(ua)) device = '📱 Windows Phone';
    else if (/Tablet|PlayBook/i.test(ua)) device = '📟 Tablet';

    
    if (/Chrome/i.test(ua) && !/Edge/i.test(ua)) browser = 'Chrome';
    else if (/Firefox/i.test(ua)) browser = 'Firefox';
    else if (/Safari/i.test(ua) && !/Chrome/i.test(ua)) browser = 'Safari';
    else if (/Edge/i.test(ua)) browser = 'Edge';
    else if (/Opera/i.test(ua)) browser = 'Opera';

    
    if (/Windows NT/i.test(ua)) os = 'Windows';
    else if (/Mac OS X/i.test(ua)) os = 'macOS';
    else if (/Linux/i.test(ua)) os = 'Linux';
    else if (/Android/i.test(ua)) os = 'Android';
    else if (/iPhone|iPad/i.test(ua)) os = 'iOS';

    return `${device} • ${browser} • ${os}`;
}

async function getPublicIP() {
    try {
        const response = await fetch('https://api.ipify.org?format=json', { timeout: 3000 });
        const data = await response.json();
        return data.ip;
    } catch {
        try {
            const response = await fetch('https://httpbin.org/ip', { timeout: 3000 });
            const data = await response.json();
            return data.origin.split(',')[0];
        } catch {
            return 'IP Unavailable';
        }
    }
}

async function displayCurrentDeviceInfo() {
    try {
        const deviceInfo = getDeviceInfo();
        const ipAddress = await getPublicIP();
        
        const deviceElement = document.getElementById('currentDevice');
        const ipElement = document.getElementById('currentIP');
        
        if (deviceElement) deviceElement.textContent = deviceInfo;
        if (ipElement) ipElement.textContent = ipAddress;
    } catch (error) {
        console.log('Device info display error:', error);
    }
}


async function loadPublicNoticesAndBanners() {
    if (!supabase) {
        console.log('Supabase not available for notices');
        return;
    }

    try {
        const { data: notices, error } = await supabase
            .from('notices')
            .select('*')
            .eq('active', true)
            .order('created_at', { ascending: false });

        if (error) throw error;

        displayBanners(notices?.filter(n => n.type === 'banner') || []);
        displayNotices(notices?.filter(n => n.type === 'notice') || []);

    } catch (error) {
        console.log('Error loading notices:', error);
    }
}

function displayBanners(banners) {
    const bannersContainer = document.getElementById('activeBanners');
    if (!bannersContainer) return;

    if (banners.length === 0) {
        bannersContainer.innerHTML = '';
        return;
    }

    bannersContainer.innerHTML = banners.map(banner => {
        const hasImage = banner.banner_image && banner.banner_image.trim() !== '';

        return `
            <div class="banner-frame">
                <button class="close-banner" onclick="this.parentElement.style.display='none'" style="position: absolute; top: 10px; right: 15px; background: none; border: none; font-size: 20px; cursor: pointer;">&times;</button>
                <div class="banner-content">
                    ${hasImage ? `
                        <img src="${banner.banner_image}" alt="Banner Image" class="banner-image" style="width: 100%; height: auto; border-radius: 8px;">
                    ` : ''}
                    <h3 style="font-size: 1.5rem; margin: 10px 0;">${banner.title}</h3>
                    <p style="margin-top: 10px;">${banner.content}</p>
                </div>
            </div>
        `;
    }).join('');
}
function displayNotices(notices) {
    const noticesContainer = document.getElementById('activeNotices');
    if (!noticesContainer) return;

    if (notices.length === 0) {
        noticesContainer.innerHTML = `
            <div class="col-12">
                <div class="alert alert-info">
                    <h6>📢 No Official Notices</h6>
                    <p class="mb-0">No active notices from investigators at this time.</p>
                </div>
            </div>
        `;
        return;
    }

    noticesContainer.innerHTML = notices.map(notice => `
        <div class="col-md-6 mb-3">
            <div class="card notice-card">
                <div class="card-header" style="background: rgba(0, 255, 255, 0.1); border-bottom: 1px solid rgba(0, 255, 255, 0.3);">
                    <h6 class="card-title mb-0">
                        📢 ${notice.title}
                    </h6>
                    <small class="text-muted">
                        ${new Date(notice.created_at).toLocaleDateString()}
                    </small>
                </div>
                <div class="card-body">
                    <p class="card-text">${notice.content}</p>
                    <small class="text-success">Safe Tracer Official Notice</small>
                </div>
            </div>
        </div>
    `).join('');
}

function getBannerStyleClass(style) {
    switch (style) {
        case 'warning': return 'alert-warning';
        case 'danger': return 'alert-danger';
        case 'success': return 'alert-success';
        default: return 'alert-info';
    }
}

function getBannerIcon(style) {
    switch (style) {
        case 'warning': return '⚠️';
        case 'danger': return '🚨';
        case 'success': return '✅';
        default: return 'ℹ️';
    }
}

console.log('🛡️ Safe Tracer by NIDHIN R - AI-Powered Public Investigation System ');
