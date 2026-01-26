# New Feature List

## Fasting & Meal Timing Tracker

### Auto-Fasting Timer
- Display a live countdown/timer showing time elapsed since last logged meal
- Visual indicator box on main dashboard showing current fasting window duration
- Track daily fasting window duration (time between last meal and first meal next day)

### Meal-to-Sleep Analysis (Whoop Integration)
- Automatically calculate time between last meal of the day and sleep onset
- Once Whoop sleep data populates (next morning), combine:
  - Last meal timestamp from food logs
  - Sleep onset time from Whoop data
  - Generate metric: "Hours between last meal and sleep"
- Target recommendation: 4+ hours (Bryan Johnson protocol)
- Historical tracking of meal-to-sleep timing
- Visual alerts/warnings if last meal was too close to bedtime
- Weekly/monthly averages of meal-to-sleep gap

### Benefits
- Optimize digestion before sleep
- Improve sleep quality metrics
- Follow circadian rhythm eating patterns
- Track compliance with time-restricted eating protocols

---

## Customizable Analytics Dashboard

### Metric Selection & Configuration
- Allow users to choose which metrics/graphs appear on the Analytics tab
- Currently the analytics view is static with fixed metrics
- Create a metric library/picker showing all available data points:
  - Whoop metrics (recovery, HRV, sleep, strain, RHR, SPO2, etc.)
  - Nutrition metrics (calories, protein, carbs, fat, micronutrients)
  - Workout metrics (volume, sets, reps, cardio duration)
  - Habit metrics (meditation, reading, sauna, etc.)
  - Supplement tracking
  - Body metrics (weight, body fat, measurements)
  - Custom calculated metrics (fasting window, meal timing, etc.)

### Drag-and-Drop Reordering
- Reorganize graphs in custom order via drag-and-drop interface
- Save user's preferred layout/configuration
- Ability to show/hide specific metrics
- Pin favorite metrics to top

### Benefits
- Personalized dashboard focused on metrics that matter most to each user
- Reduce clutter by hiding irrelevant metrics
- Quick access to key performance indicators
- Better UX for different user goals (strength focus vs. endurance vs. longevity optimization)

---

## Peptide Tracking

### Add Peptides as Supplement Category
- Expand supplement library to include peptides as a trackable category
- Pre-populate common peptides used in longevity/performance optimization:
  - **MT1** (Melanotan I) - tanning, skin protection
  - **MT2** (Melanotan II) - tanning, libido
  - **Tirzepatide** (Mounjaro/Zepbound) - GLP-1/GIP agonist, weight loss
  - **Semaglutide** (Ozempic/Wegovy) - GLP-1 agonist, weight loss
  - **Retatrutide** (Reta) - triple agonist, weight loss
  - **GHK-Cu** (GHK Copper) - skin, healing, anti-aging
  - **BPC-157** - healing, recovery, gut health
  - **TB-500** (Thymosin Beta-4) - healing, recovery
  - **Ipamorelin** - growth hormone secretagogue
  - **CJC-1295** - growth hormone releasing hormone
  - **Tesamorelin** - growth hormone releasing hormone, visceral fat
  - **AOD-9604** - fat loss
  - **Epithalon** - telomerase activation, longevity
  - **Selank** - anxiety, cognitive enhancement
  - **Semax** - cognitive enhancement, neuroprotection
  - **Cerebrolysin** - nootropic, neuroprotection
  - **NAD+** - cellular energy, anti-aging
  - **MOTS-c** - mitochondrial function, metabolism

### Dosing & Protocol Tracking
- Track dosage amount (mg or IU)
- Track injection site (if subcutaneous)
- Track frequency/schedule (daily, EOD, weekly, etc.)
- Track cycle duration (e.g., "Week 3 of 12-week protocol")
- Notes field for side effects or observations

### Benefits
- Comprehensive tracking for users on peptide protocols
- Monitor cycling schedules and adherence
- Track correlations between peptide use and performance/body metrics
- Safety tracking for potential side effects

---

## Automatic Whoop Data Sync

### Hourly Background Sync
- Currently Whoop data only syncs when user manually clicks the sync button
- Change to automatic background sync every hour (or configurable interval)
- Implement using:
  - Server-side cron job (already have `/api/cron/daily-sync` endpoint)
  - Client-side interval timer when app is open
  - Service worker background sync for PWA

### Implementation Options
- **Option 1:** Vercel cron job running hourly to sync Whoop data for all connected users
- **Option 2:** Client-side auto-sync when app is active (check every hour if data needs refresh)
- **Option 3:** Hybrid - server cron + client fallback for real-time updates

### Features
- Data always up-to-date without manual intervention
- Visual indicator showing last sync time
- Manual sync button still available for immediate refresh
- Handle rate limits from Whoop API gracefully
- Cache data to avoid redundant API calls if data hasn't changed

### Benefits
- Seamless user experience - data just appears
- Morning routines automatically have fresh sleep data
- No need to remember to manually sync
- Better for meal-to-sleep analysis (sleep data populated automatically)
