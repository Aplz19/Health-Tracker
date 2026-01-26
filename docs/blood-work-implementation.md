# Blood Work Implementation Plan

## Overview
Allow users to upload and track blood work results, with future AI analysis capabilities.

## UI Placement
**Analytics tab** - Add a "Blood Work" section (collapsible card). This is where users would want to see the data and correlations anyway, and keeps navigation simple.

## Data Model

### blood_tests
| Column | Type | Description |
|--------|------|-------------|
| id | uuid | Primary key |
| user_id | uuid | Foreign key to auth.users |
| test_date | date | Date of the blood test |
| lab_name | text | Optional - name of lab/provider |
| notes | text | Optional - any notes about the test |
| pdf_url | text | Optional - for future file upload |
| created_at | timestamp | Auto-generated |

### blood_markers
| Column | Type | Description |
|--------|------|-------------|
| id | uuid | Primary key |
| blood_test_id | uuid | Foreign key to blood_tests |
| marker_name | text | e.g., "LDL Cholesterol", "Glucose" |
| value | numeric | The measured value |
| unit | text | e.g., "mg/dL", "mmol/L" |
| reference_low | numeric | Optional - low end of normal range |
| reference_high | numeric | Optional - high end of normal range |

## Common Blood Markers (Presets)
- **Lipid Panel**: Total Cholesterol, LDL, HDL, Triglycerides
- **Metabolic**: Glucose, HbA1c, Insulin
- **Liver**: ALT, AST, Bilirubin, Albumin
- **Kidney**: Creatinine, BUN, eGFR
- **Thyroid**: TSH, T3, T4
- **Vitamins**: Vitamin D, B12, Folate, Iron, Ferritin
- **Hormones**: Testosterone, Estrogen, Cortisol
- **Inflammatory**: CRP, ESR
- **Blood Count**: RBC, WBC, Hemoglobin, Hematocrit, Platelets

## MVP Upload Flow
1. Click "Add Blood Work" in Analytics tab
2. Pick date, enter lab name (optional)
3. Add markers one by one (name, value, unit) - or pick from common presets
4. Save

## Future Enhancements

### PDF/Photo Upload
- Upload PDF or photo of blood work results
- Use AI (GPT-4 vision) to extract marker values
- User confirms/edits extracted values before saving

### AI Analysis
- **Auto-generated insights**: After blood work upload, AI analyzes against nutrition/sleep/exercise data
- **Chat interface**: Ask questions like "Why is my LDL high?"
- **Cost optimization**: Pre-aggregate daily data into weekly summaries before sending to AI

### Trend Visualization
- Chart marker values over time (multiple blood tests)
- Show reference ranges as shaded regions
- Highlight out-of-range values

## Cost Considerations (for AI features)
- Pre-aggregate nutrition/health data to reduce tokens
- Use GPT-4o-mini for simple queries, GPT-4 for deep analysis
- Cache generated insights after blood work upload
- Smart context selection - only send relevant data based on marker type

## Disclaimer
App must include disclaimer: "This is not medical advice. Consult a healthcare provider for interpretation of blood work results."
