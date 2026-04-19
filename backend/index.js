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

// Initialize Gemini
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

app.post('/api/grade', async (req, res) => {
  const { assignment_prompt, max_points, student_submission } = req.body;

  if (!assignment_prompt || !max_points || !student_submission) {
    return res.status(400).json({ error: 'Missing required fields' });
  }

  try {
    const model = genAI.getGenerativeModel({
      model: 'gemini-1.5-flash',
      systemInstruction: `You are an expert high school teacher. Evaluate the student submission against the assignment prompt. The max score is ${max_points}. Provide warm, constructive feedback and a calculated score. Return ONLY a valid JSON object matching this schema: {"score": number, "feedback": "string"}.`,
    });

    const prompt = `
Assignment Prompt:
${assignment_prompt}

Max Points: ${max_points}

Student Submission:
${student_submission}
`;

    const result = await model.generateContent(prompt);
    const response = await result.response;
    const text = response.text();

    // Clean up the response in case the model wraps it in markdown code blocks
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      throw new Error('Invalid response format from AI');
    }

    const jsonResponse = JSON.parse(jsonMatch[0]);
    res.json(jsonResponse);
  } catch (error) {
    console.error('Error during grading:', error);
    res.status(500).json({ error: 'Failed to generate grade', details: error.message });
  }
});

app.listen(port, () => {
  console.log(`Backend server running at http://localhost:${port}`);
});
