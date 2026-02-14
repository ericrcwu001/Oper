import { Router } from 'express';
import { getCrimesForDay, getRandomDateInDataset } from '../services/crimesDataService.js';

const router = Router();

/**
 * GET /api/crimes?date=YYYY-MM-DD
 * Returns all crimes for that day with simSecondsFromMidnight (for 3x playback).
 * If date is omitted, uses a random date from the dataset.
 */
router.get('/', async (req, res) => {
  try {
    let date = req.query.date;
    if (!date) {
      const randomDate = await getRandomDateInDataset();
      date = randomDate || '2015-05-13';
    }
    const crimes = await getCrimesForDay(date);
    res.json({ date, crimes });
  } catch (err) {
    console.error('GET /api/crimes error:', err);
    res.status(500).json({ error: 'Failed to load crimes data', details: err.message });
  }
});

export default router;
