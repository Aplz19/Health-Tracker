# Whoop API Information

## Available Metrics

### Recovery
| Metric | Description |
|--------|-------------|
| Recovery Score | 0-100% overall recovery rating |
| HRV (hrv_rmssd_milli) | Heart Rate Variability in milliseconds |
| Resting Heart Rate | Beats per minute at rest |
| SpO2 | Blood oxygen percentage |
| Skin Temperature | Body temperature in celsius |

### Sleep
| Metric | Description |
|--------|-------------|
| Sleep Performance % | How well you slept vs need |
| Sleep Consistency % | Regularity of sleep schedule |
| Sleep Efficiency % | Time asleep vs time in bed |
| Respiratory Rate | Breaths per minute |
| Total Time in Bed | Total duration in bed (ms) |
| Total Awake Time | Time spent awake (ms) |
| Light Sleep Duration | Light sleep stage (ms) |
| Deep Sleep Duration | Slow wave sleep stage (ms) |
| REM Sleep Duration | REM stage (ms) |
| Sleep Cycle Count | Number of complete cycles |
| Disturbance Count | Number of disturbances |
| Sleep Needed - Baseline | Base sleep requirement (ms) |
| Sleep Needed - From Debt | Additional need from sleep debt (ms) |
| Sleep Needed - From Strain | Additional need from recent strain (ms) |
| Sleep Needed - From Nap | Adjustment from recent naps (ms) |

### Strain (Daily Cycle)
| Metric | Description |
|--------|-------------|
| Strain Score | 0-21 scale of daily exertion |
| Kilojoules | Energy burned |
| Average Heart Rate | Daily average HR (bpm) |
| Max Heart Rate | Peak HR for the day (bpm) |

### Workouts
| Metric | Description |
|--------|-------------|
| Workout Strain | 0-21 strain for the activity |
| Average Heart Rate | Avg HR during workout (bpm) |
| Max Heart Rate | Peak HR during workout (bpm) |
| Kilojoules | Energy burned in workout |
| Distance | Distance covered (meters) |
| Altitude Gain | Elevation gained (meters) |
| Altitude Change | Net elevation change (meters) |
| Zone 0 Duration | Time in zone 0 (ms) |
| Zone 1 Duration | Time in zone 1 (ms) |
| Zone 2 Duration | Time in zone 2 (ms) |
| Zone 3 Duration | Time in zone 3 (ms) |
| Zone 4 Duration | Time in zone 4 (ms) |
| Zone 5 Duration | Time in zone 5 (ms) |
| Sport ID | Activity type identifier |
| Percent Recorded | % of workout with HR data |

---

## API Endpoints

| Endpoint | Description |
|----------|-------------|
| `GET /v2/cycle` | Daily physiological cycles with strain |
| `GET /v2/recovery` | Recovery scores and metrics |
| `GET /v2/activity/sleep` | Sleep data and stages |
| `GET /v2/activity/workout` | Workout/exercise data |
| `GET /v2/user/profile/basic` | User profile info |

---

## Rate Limits

| Limit | Amount |
|-------|--------|
| Per minute | 100 requests |
| Per day (24hr) | 10,000 requests |

### Important Notes

- Limits apply per **API client** (your app), NOT per connected Whoop user
- If you have 10 users, they all share the same 100/min and 10k/day limits
- Response headers show current status:
  - `X-RateLimit-Remaining`: Requests left before hitting limit
  - `X-RateLimit-Reset`: Seconds until window resets
- Exceeding limits returns `429 Too Many Requests`
- Higher limits can be requested from Whoop

### Practical Usage

For a personal app syncing once daily:
- ~3-4 API calls per user per sync (cycles, recovery, sleep)
- 10 users syncing daily = ~40 calls/day
- Well within the 10,000/day limit

---

## API Version

- **Current**: v2 API
- **Deadline**: v1 API removed after October 1, 2025
- All new features are v2 exclusive

---

## Documentation Links

- [WHOOP API Docs](https://developer.whoop.com/api/)
- [Rate Limiting](https://developer.whoop.com/docs/developing/rate-limiting/)
- [v1 to v2 Migration](https://developer.whoop.com/docs/developing/v1-v2-migration/)
- [Developer Support](https://developer.whoop.com/docs/developing/support/)
