const express = require('express');
const cors = require('cors');
const dotenv = require('dotenv');
const { GoogleGenerativeAI } = require('@google/generative-ai');

dotenv.config();

const app = express();
const port = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json());

// Initialize Gemini with API Key Check
const apiKey = process.env.GEMINI_API_KEY;
if (!apiKey) {
  console.error('[CRITICAL] GEMINI_API_KEY is missing from environment variables!');
} else {
  console.log('[INFO] GEMINI_API_KEY is configured (Length: ' + apiKey.length + ')');
}

const genAI = new GoogleGenerativeAI(apiKey);

app.post('/api/grade', async (req, res) => {
  const { assignment_prompt, max_points, student_submission } = req.body;

  console.log(`[REQUEST] New grading request. Max Points: ${max_points}`);

  // Robust validation: Allow 0 for max_points
  const missingFields = [];
  if (assignment_prompt === undefined || assignment_prompt === null) missingFields.push('assignment_prompt');
  if (max_points === undefined || max_points === null) missingFields.push('max_points');
  if (student_submission === undefined || student_submission === null) missingFields.push('student_submission');

  if (missingFields.length > 0) {
    console.error(`[ERROR] Missing fields: ${missingFields.join(', ')}`);
    return res.status(400).json({ 
      error: 'Missing required fields', 
      details: `The following fields are missing or null: ${missingFields.join(', ')}` 
    });
  }

  try {
    const model = genAI.getGenerativeModel({
      model: 'gemini-1.5-flash',
      systemInstruction: `You are an expert high school teacher. Evaluate the student submission against the assignment prompt. The max score is ${max_points}. Provide warm, constructive feedback and a calculated score. Return ONLY a valid JSON object matching this schema: {"score": number, "feedback": "string"}.`,
    });

    const promptText = `
Assignment Prompt:
${assignment_prompt}

Max Points: ${max_points}

Student Submission:
${student_submission}
`;

    console.log('[INFO] Calling Gemini API...');
    const result = await model.generateContent(promptText);
    const response = await result.response;
    const text = response.text();

    console.log('[DEBUG] Raw AI Response:', text);

    // Clean up the response
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      console.error('[ERROR] No JSON found in AI response');
      throw new Error('AI returned an invalid format. Raw response: ' + text);
    }

    const jsonResponse = JSON.parse(jsonMatch[0]);
    console.log('[SUCCESS] Grading complete.');
    res.json(jsonResponse);
  } catch (error) {
    console.error('[FATAL] Error during grading:', error);
    res.status(500).json({ 
      error: 'Failed to generate grade', 
      details: error.message,
      stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
    });
  }
});

app.listen(port, () => {
  console.log(`Backend server running at http://localhost:${port}`);
});
