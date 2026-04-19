// --- CONFIGURATION ---
// 1. For local development, use: 'http://localhost:3000/api/grade'
// 2. For production, use your Render URL: 'https://your-app-name.onrender.com/api/grade'
const BACKEND_URL = 'http://localhost:3000/api/grade';
// ---------------------

/**
 * Extract parameters from the Canvas URL
 */
function getCanvasParams() {
  const url = new URL(window.location.href);
  
  // Course ID is typically in the path: /courses/:id/
  const courseIdMatch = window.location.pathname.match(/\/courses\/(\d+)/);
  const courseId = courseIdMatch ? courseIdMatch[1] : null;

  // Assignment ID is in the query params
  const assignmentId = url.searchParams.get('assignment_id');

  // Student ID is often in the URL hash as a JSON string
  let studentId = null;
  const hash = window.location.hash;
  if (hash) {
    try {
      const hashParams = JSON.parse(decodeURIComponent(hash.substring(1)));
      studentId = hashParams.student_id;
    } catch (e) {
      console.warn('Failed to parse student_id from hash:', e);
    }
  }

  return { courseId, assignmentId, studentId };
}

/**
 * Inject the AI Grader button into the SpeedGrader UI
 */
function injectButton() {
  if (document.getElementById('ai-grader-btn')) return;

  // Locate the right sidebar or comment box
  const commentBox = document.getElementById('speedgrader_comment_textarea');
  if (!commentBox) {
    // If comment box isn't found, wait and try again
    setTimeout(injectButton, 1000);
    return;
  }

  const container = document.createElement('div');
  container.className = 'ai-grader-container';

  const button = document.createElement('button');
  button.id = 'ai-grader-btn';
  button.className = 'ai-grader-btn';
  button.innerHTML = '🤖 AI Grader';
  button.onclick = handleGradeClick;

  container.appendChild(button);
  
  // Inject into the sidebar above comments
  const sidebar = document.getElementById('right_side');
  if (sidebar) {
    const commentsSection = document.querySelector('.speedgrader-sidebar-comments');
    if (commentsSection) {
      commentsSection.parentNode.insertBefore(container, commentsSection);
    } else {
      commentBox.parentNode.insertBefore(container, commentBox);
    }
  }
}

/**
 * Handle AI Grader button click
 */
async function handleGradeClick() {
  const button = document.getElementById('ai-grader-btn');
  const originalText = button.innerHTML;
  
  const { courseId, assignmentId, studentId } = getCanvasParams();

  if (!courseId || !assignmentId || !studentId) {
    alert('Could not detect Course, Assignment, or Student ID. Please ensure you are on a valid SpeedGrader page.');
    return;
  }

  try {
    button.disabled = true;
    button.innerHTML = '🔄 Grading...';

    // 1. Fetch Assignment Info
    const assignmentRes = await fetch(`/api/v1/courses/${courseId}/assignments/${assignmentId}`);
    const assignment = await assignmentRes.json();
    const assignmentPrompt = assignment.description || 'No prompt provided.';
    const maxPoints = assignment.points_possible || 0;

    // 2. Fetch Submission Info
    const submissionRes = await fetch(`/api/v1/courses/${courseId}/assignments/${assignmentId}/submissions/${studentId}`);
    const submission = await submissionRes.json();
    
    // Submissions can be online_text_entry or file_upload
    let studentSubmission = '';
    if (submission.submission_type === 'online_text_entry') {
      studentSubmission = submission.body;
    } else if (submission.submission_type === 'online_upload' && submission.attachments) {
      // For uploads, we might not get the text directly. 
      // Simple version: just use the submission comments or a placeholder if text isn't available.
      studentSubmission = "[File Upload Execution - Text extraction not implemented in this demo]";
    } else {
      studentSubmission = submission.body || 'No submission text found.';
    }

    // 3. POST to Backend
    const gradeRes = await fetch(BACKEND_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        assignment_prompt: assignmentPrompt,
        max_points: maxPoints,
        student_submission: studentSubmission
      })
    });

    const gradeData = await gradeRes.json();

    if (gradeData.error) {
      throw new Error(gradeData.error);
    }

    // 4. Update UI
    const gradeInput = document.getElementById('grading-box-extended');
    const commentArea = document.getElementById('speedgrader_comment_textarea');

    if (gradeInput) {
      gradeInput.value = gradeData.score;
      // Trigger a change event so Canvas knows the value changed
      gradeInput.dispatchEvent(new Event('change', { bubbles: true }));
    }

    if (commentArea) {
      commentArea.value = gradeData.feedback;
      commentArea.dispatchEvent(new Event('input', { bubbles: true }));
    }

    button.innerHTML = '✅ Done!';
    setTimeout(() => {
      button.innerHTML = '🤖 AI Grader';
      button.disabled = false;
    }, 3000);

  } catch (error) {
    console.error('AI Grading failed:', error);
    alert('AI Grading failed: ' + error.message);
    button.innerHTML = '❌ Failed';
    button.disabled = false;
  }
}

// Start injection when script runs
injectButton();

// Canvas SpeedGrader uses a single-page approach for student switching
// We need to re-detect parameters when the hash changes
window.addEventListener('hashchange', () => {
    // Parameters updated automatically via getCanvasParams in handleGradeClick
});
