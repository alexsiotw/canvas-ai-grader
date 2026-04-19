// --- CONFIGURATION ---
const BACKEND_URL = 'https://canvas-ai-grader-c73v.onrender.com/api/grade';
// ---------------------

const isTopFrame = window.top === window.self;
console.log(`[AI Grader] Script running in ${isTopFrame ? 'TOP' : 'IFRAME'}: ${window.location.href}`);

/**
 * Extract parameters from the Canvas URL
 */
function getCanvasParams() {
  let url;
  try {
    url = new URL(isTopFrame ? window.location.href : window.parent.location.href);
  } catch (e) {
    url = new URL(window.location.href);
  }
  
  const path = isTopFrame ? window.location.pathname : url.pathname;
  const courseIdMatch = path.match(/\/courses\/(\d+)/);
  const courseId = courseIdMatch ? courseIdMatch[1] : null;

  const assignmentId = url.searchParams.get('assignment_id');

  // Check query params first, then hash
  let studentId = url.searchParams.get('student_id');
  
  if (!studentId) {
    const hash = url.hash;
    if (hash) {
      try {
        const hashParams = JSON.parse(decodeURIComponent(hash.substring(1)));
        studentId = hashParams.student_id;
      } catch (e) {
        // Ignored
      }
    }
  }

  // Fallback for anonymous grading
  if (!studentId) {
    studentId = url.searchParams.get('anonymous_id');
  }

  return { courseId, assignmentId, studentId };
}

/**
 * DOM Scanner for Debugging
 * Logs all inputs and buttons to help identify targets
 */
function scanDOM() {
    const inputs = document.querySelectorAll('input, textarea, button');
    console.log(`[AI Grader] Scanner found ${inputs.length} elements in frame.`);
    
    // Only log once to avoid cluttering
    if (window.hasScanned) return;
    window.hasScanned = true;

    inputs.forEach(el => {
        if (el.id || el.className || el.getAttribute('aria-label')) {
            console.log(`[AI Grader] Element: <${el.tagName}> id="${el.id}" class="${el.className}" aria-label="${el.getAttribute('aria-label')}"`);
        }
    });

    // Also look for "Assessment" header
    const headers = document.querySelectorAll('h1, h2, h3, h4, b');
    headers.forEach(h => {
        if (h.textContent.includes('Assessment')) {
            console.log(`[AI Grader] Found header: "${h.textContent}"`);
        }
    });
}

/**
 * Inject the AI Grader button into the SpeedGrader UI
 */
function injectButton() {
  if (document.getElementById('ai-grader-btn')) return;

  scanDOM();

  // Smart Selectors (Order of stability)
  const selectors = [
    'input[aria-label*="Grade"]',      // Best for identifying the grading section
    'textarea[aria-label*="Comment"]', // Best for identifying comment section
    '#grading-box-extended',          // Historical ID
    '#speedgrader_comment_textarea',   // Historical ID
    '.speedgrader-sidebar-comments',   // Container
    '#right_side_content'              // Last resort sidebar content
  ];

  let target = null;
  for (const selector of selectors) {
    const el = document.querySelector(selector);
    if (el) {
      // If we find an input/textarea, we want to inject into its parent container
      target = el.closest('.speedgrader-sidebar-comments') || el.closest('#grading-box-extended-container') || el.parentNode;
      console.log(`[AI Grader] Target identified via: ${selector}`);
      break;
    }
  }

  // Backup: Search by text content ("Assessment")
  if (!target) {
      const bTags = document.querySelectorAll('b, h2, h3');
      for (const b of bTags) {
          if (b.textContent.includes('Assessment')) {
              target = b.parentNode;
              console.log('[AI Grader] Target identified via "Assessment" label');
              break;
          }
      }
  }

  if (!target) return;

  const container = document.createElement('div');
  container.className = 'ai-grader-container';
  container.style.marginTop = '15px';
  container.style.borderTop = '1px solid #ccc';
  container.style.paddingTop = '10px';

  const button = document.createElement('button');
  button.id = 'ai-grader-btn';
  button.className = 'ai-grader-btn';
  button.innerHTML = '🤖 AI Grader';
  button.onclick = handleGradeClick;

  container.appendChild(button);
  
  // Inject at the top of the identified section
  target.prepend(container);
  console.log('[AI Grader] Button injected successfully.');
}

/**
 * Handle AI Grader button click
 */
async function handleGradeClick() {
  const button = document.getElementById('ai-grader-btn');
  const { courseId, assignmentId, studentId } = getCanvasParams();

  if (!courseId || !assignmentId || !studentId) {
    alert('Detection issue: Ensure you are on a valid SpeedGrader page.');
    return;
  }

  try {
    button.disabled = true;
    button.innerHTML = '🔄 Grading...';

    // 1. Fetch info
    const assignmentRes = await fetch(`/api/v1/courses/${courseId}/assignments/${assignmentId}`);
    const assignment = await assignmentRes.json();
    const assignmentPrompt = assignment.description || 'No instructions provided for this assignment.';
    const maxPoints = (assignment.points_possible !== undefined && assignment.points_possible !== null) 
      ? assignment.points_possible 
      : 0;

    const submissionRes = await fetch(`/api/v1/courses/${courseId}/assignments/${assignmentId}/submissions/${studentId}`);
    const submission = await submissionRes.json();
    
    let studentSubmission = submission.body || '';
    if (!studentSubmission && submission.submission_type === 'online_upload' && submission.attachments) {
        studentSubmission = `[File Upload Submission: ${submission.attachments.length} file(s) attached]`;
    }
    
    // Final safety check to ensure nothing is null
    const finalSubmission = studentSubmission || '[Empty Submission]';

    // 2. AI Call
    const gradeRes = await fetch(BACKEND_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        assignment_prompt: assignmentPrompt,
        max_points: maxPoints,
        student_submission: finalSubmission
      })
    });

    const gradeData = await gradeRes.json();
    if (gradeData.error) throw new Error(gradeData.error);

    // 3. UI Update (Smart Update)
    const gradeInput = document.querySelector('input[aria-label*="Grade"]') || document.getElementById('grading-box-extended');
    const commentArea = document.querySelector('textarea[aria-label*="Comment"]') || document.getElementById('speedgrader_comment_textarea');

    if (gradeInput) {
      gradeInput.value = gradeData.score;
      gradeInput.dispatchEvent(new Event('input', { bubbles: true }));
      gradeInput.dispatchEvent(new Event('change', { bubbles: true }));
      gradeInput.dispatchEvent(new Event('blur', { bubbles: true }));
    }

    if (commentArea) {
      commentArea.value = gradeData.feedback;
      commentArea.dispatchEvent(new Event('input', { bubbles: true }));
      commentArea.dispatchEvent(new Event('change', { bubbles: true }));
      commentArea.dispatchEvent(new Event('blur', { bubbles: true }));
    }

    button.innerHTML = '✅ Done!';
    setTimeout(() => {
      button.innerHTML = '🤖 AI Grader';
      button.disabled = false;
    }, 3000);

  } catch (error) {
    console.error('[AI Grader] Grading failed:', error);
    alert('AI Grading failed: ' + error.message);
    button.innerHTML = '❌ Failed';
    button.disabled = false;
  }
}

// Robust Observer
const observer = new MutationObserver(() => {
    injectButton();
});

observer.observe(document.body, { childList: true, subtree: true });
injectButton();
const retryInterval = setInterval(injectButton, 2000);
setTimeout(() => clearInterval(retryInterval), 10000);
