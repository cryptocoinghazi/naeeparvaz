UPDATE site_settings
SET editor_title_hi = 'मुख्य संपादक, नई परवाज न्यूज़',
    updated_at = CURRENT_TIMESTAMP
WHERE id = 1
  AND editor_title_hi = 'मुख्य संपादक, नई परवाज़ न्यूज़';
