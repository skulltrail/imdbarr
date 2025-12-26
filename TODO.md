# Community Needs & Wants

Based on community feedback and common feature requests for Sonarr list tools:

- [ ] **Bi-directional Sync**: Ability to add shows to the IMDb watchlist if they are added directly in Sonarr.
  - Delete shows from Sonarr if they are removed from the watchlist and if monitor is set to "Pilot" or "First Season"
- [ ] **Filtering**: Add support for filtering shows based on:
  - Genre
  - IMDb Rating (min/max)
  - Vote Count
  - Release Year
- [ ] **Sonarr Configuration**:
  - Allow setting "Monitored" status (e.g., only monitor first season, or all seasons).
  - Allow selecting specific Quality Profiles for added shows.
  - Allow selecting Root Folder paths per list.
- [ ] **Notifications**: Webhook or notification support (Discord/Slack/Telegram) when a show is added or removed.
- [ ] **Dry Run Mode**: A mode to see what would be added/removed without actually performing the actions.
- [ ] **Multiple Lists**: Support for syncing multiple IMDb lists to different Sonarr endpoints or tags.
- [ ] **Performance**: Improve caching for TMDB API calls to reduce rate limiting issues.
