// Where the news comes from.
//
// A broad pool per topic is the whole point: corroboration — how many independent
// outlets carry the same event — is the strongest importance signal we have, and you
// cannot measure it from three feeds. Add outlets here and ranking gets sharper.

export const TOPICS = {
  world:    'World',
  politics: 'Politics',
  economy:  'Economy & Markets',
  tech:     'Technology',
  science:  'Science',
  health:   'Health',
  sport:    'Sport',
  food:     'Food & Cooking',
  film:     'Film & TV',
  offbeat:  'Offbeat'
};

export const FEEDS = {
  world: [
    'https://feeds.bbci.co.uk/news/world/rss.xml',
    'https://www.theguardian.com/world/rss',
    'https://www.aljazeera.com/xml/rss/all.xml',
    'https://feeds.npr.org/1004/rss.xml',
    'https://rss.nytimes.com/services/xml/rss/nyt/World.xml',
    'https://www.cbsnews.com/latest/rss/world',
    'https://feeds.skynews.com/feeds/rss/world.xml',
    'https://www.france24.com/en/rss',
    'https://www.upi.com/rss/news/top_news.rss'
  ],
  politics: [
    'https://feeds.npr.org/1014/rss.xml',
    'https://rss.nytimes.com/services/xml/rss/nyt/Politics.xml',
    'https://www.theguardian.com/us-news/rss',
    'https://thehill.com/news/feed/',
    'https://rss.politico.com/politics-news.xml',
    'https://www.cbsnews.com/latest/rss/politics',
    'https://feeds.bbci.co.uk/news/politics/rss.xml'
  ],
  economy: [
    'https://feeds.bbci.co.uk/news/business/rss.xml',
    'https://www.theguardian.com/uk/business/rss',
    'https://rss.nytimes.com/services/xml/rss/nyt/Business.xml',
    'https://feeds.npr.org/1006/rss.xml',
    'https://www.cnbc.com/id/10001147/device/rss/rss.html',
    'https://www.cbsnews.com/latest/rss/moneywatch',
    'https://feeds.marketwatch.com/marketwatch/topstories/'
  ],
  tech: [
    'https://feeds.arstechnica.com/arstechnica/index',
    'https://www.theverge.com/rss/index.xml',
    'https://techcrunch.com/feed/',
    'https://www.wired.com/feed/rss',
    'https://feeds.bbci.co.uk/news/technology/rss.xml',
    'https://www.theguardian.com/uk/technology/rss',
    'https://rss.nytimes.com/services/xml/rss/nyt/Technology.xml',
    'https://feeds.npr.org/1019/rss.xml'
  ],
  science: [
    'https://www.sciencedaily.com/rss/top/science.xml',
    'https://phys.org/rss-feed/',
    'https://www.nature.com/nature.rss',
    'https://www.theguardian.com/science/rss',
    'https://rss.nytimes.com/services/xml/rss/nyt/Science.xml',
    'https://www.sciencenews.org/feed',
    'https://www.space.com/feeds/all',
    'https://feeds.npr.org/1007/rss.xml'
  ],
  health: [
    'https://www.sciencedaily.com/rss/top/health.xml',
    'https://rss.nytimes.com/services/xml/rss/nyt/Health.xml',
    'https://www.theguardian.com/society/health/rss',
    'https://www.statnews.com/feed/',
    'https://medicalxpress.com/rss-feed/',
    'https://www.foodsafetynews.com/feed/'
  ],
  sport: [
    'https://www.espn.com/espn/rss/news',
    'https://feeds.bbci.co.uk/sport/rss.xml',
    'https://www.theguardian.com/uk/sport/rss',
    'https://rss.nytimes.com/services/xml/rss/nyt/Sports.xml',
    'https://www.cbssports.com/rss/headlines/'
  ],
  food: [
    'https://www.theguardian.com/food/rss',
    'https://www.eater.com/rss/index.xml',
    'https://rss.nytimes.com/services/xml/rss/nyt/DiningandWine.xml',
    'https://www.restaurantdive.com/feeds/news/',
    'https://www.foodsafetynews.com/feed/',
    'https://www.bonappetit.com/feed/rss',
    'https://www.thekitchn.com/main.rss',
    'https://nrn.com/rss.xml',
    'https://www.fooddive.com/feeds/news/',
    'https://www.grocerydive.com/feeds/news/'
  ],
  film: [
    'https://variety.com/feed/',
    'https://www.hollywoodreporter.com/feed/',
    'https://deadline.com/feed/',
    'https://www.theguardian.com/uk/film/rss',
    'https://rss.nytimes.com/services/xml/rss/nyt/Movies.xml',
    'https://feeds.bbci.co.uk/news/entertainment_and_arts/rss.xml'
  ],
  // Weird and quirky in one lane, per the brief. Sourced from dedicated offbeat desks
  // rather than a keyword search, then filtered for grimness in the pipeline.
  offbeat: [
    'https://rss.upi.com/news/odd_news.rss',
    'https://nypost.com/odd-news/feed/',
    'https://www.odditycentral.com/feed',
    'https://www.atlasobscura.com/feeds/latest',
    'https://www.goodnewsnetwork.org/feed/',
    'https://www.sciencedaily.com/rss/strange_offbeat.xml',
    'https://feeds.skynews.com/feeds/rss/strange.xml',
    'https://www.smithsonianmag.com/rss/smart-news/',
    'https://boingboing.net/feed'
  ]
};

// Custom topics the reader types go to Google News search, which spans every outlet
// it indexes and reports the publisher per item — so corroboration still works.
export const searchFeed = q =>
  'https://news.google.com/rss/search?q=' + encodeURIComponent(q) +
  '&hl=en-US&gl=US&ceid=US:en';

// Outlet standing. Unlisted outlets get DEFAULT_TIER — unknown is not the same as bad.
export const DEFAULT_TIER = 0.62;
export const TIER = {
  'Reuters': 1, 'AP News': 1, 'Associated Press': 1, 'BBC': 1, 'BBC News': 1, 'NPR': 1,
  'The New York Times': 1, 'The Washington Post': 1, 'The Guardian': 1, 'Al Jazeera': 1,
  'PBS NewsHour': 1, 'Financial Times': 1, 'The Economist': 1, 'Nature': 1, 'Science': 0.95,
  'CBS News': 0.85, 'NBC News': 0.85, 'ABC News': 0.85, 'CNN': 0.9, 'CNBC': 0.85,
  'Bloomberg': 0.9, 'Sky News': 0.82, 'France 24': 0.8, 'Politico': 0.85, 'Axios': 0.85,
  'The Hill': 0.8, 'MarketWatch': 0.78, 'STAT': 0.85, 'Science News': 0.85, 'Phys.org': 0.75,
  'ScienceDaily': 0.72, 'Space.com': 0.78, 'Live Science': 0.76, 'Medical Xpress': 0.72,
  'Ars Technica': 0.85, 'The Verge': 0.82, 'TechCrunch': 0.82, 'Wired': 0.85,
  'ESPN': 0.85, 'CBS Sports': 0.8, 'Variety': 0.85, 'The Hollywood Reporter': 0.85,
  'Deadline': 0.8, 'Eater': 0.75, 'Serious Eats': 0.72, 'Restaurant Dive': 0.78,
  'Food Dive': 0.78, 'Grocery Dive': 0.72, "Nation's Restaurant News": 0.72,
  'Food Safety News': 0.72, 'UPI': 0.75, 'Atlas Obscura': 0.7, 'Boing Boing': 0.62,
  'Good News Network': 0.6, 'Mental Floss': 0.62
};

// Feed host -> display name. Feeds are wildly inconsistent about naming themselves.
export const OUTLET_BY_HOST = {
  'bbci.co.uk': 'BBC News', 'bbc.co.uk': 'BBC News', 'bbc.com': 'BBC News',
  'theguardian.com': 'The Guardian', 'aljazeera.com': 'Al Jazeera', 'npr.org': 'NPR',
  'nytimes.com': 'The New York Times', 'washingtonpost.com': 'The Washington Post',
  'cbsnews.com': 'CBS News', 'nbcnews.com': 'NBC News', 'abcnews.go.com': 'ABC News',
  'skynews.com': 'Sky News', 'france24.com': 'France 24', 'upi.com': 'UPI',
  'politico.com': 'Politico', 'thehill.com': 'The Hill', 'cnbc.com': 'CNBC',
  'marketwatch.com': 'MarketWatch', 'reuters.com': 'Reuters', 'apnews.com': 'AP News',
  'arstechnica.com': 'Ars Technica', 'theverge.com': 'The Verge',
  'techcrunch.com': 'TechCrunch', 'wired.com': 'Wired', 'sciencedaily.com': 'ScienceDaily',
  'phys.org': 'Phys.org', 'nature.com': 'Nature', 'sciencenews.org': 'Science News',
  'space.com': 'Space.com', 'livescience.com': 'Live Science', 'statnews.com': 'STAT',
  'medicalxpress.com': 'Medical Xpress', 'foodsafetynews.com': 'Food Safety News',
  'espn.com': 'ESPN', 'cbssports.com': 'CBS Sports', 'variety.com': 'Variety',
  'hollywoodreporter.com': 'The Hollywood Reporter', 'deadline.com': 'Deadline',
  'eater.com': 'Eater', 'seriouseats.com': 'Serious Eats',
  'restaurantdive.com': 'Restaurant Dive', 'boingboing.net': 'Boing Boing',
  'atlasobscura.com': 'Atlas Obscura', 'goodnewsnetwork.org': 'Good News Network',
  'mentalfloss.com': 'Mental Floss', 'cnn.com': 'CNN', 'bloomberg.com': 'Bloomberg',
  'pbs.org': 'PBS NewsHour', 'axios.com': 'Axios', 'bonappetit.com': 'Bon Appétit',
  'thekitchn.com': 'The Kitchn', 'nrn.com': "Nation's Restaurant News",
  'fooddive.com': 'Food Dive', 'grocerydive.com': 'Grocery Dive',
  'odditycentral.com': 'Oddity Central', 'nypost.com': 'New York Post',
  'smithsonianmag.com': 'Smithsonian', 'iflscience.com': 'IFLScience',
  'theatlantic.com': 'The Atlantic', 'newsweek.com': 'Newsweek', 'time.com': 'TIME',
  'ft.com': 'Financial Times', 'economist.com': 'The Economist', 'usatoday.com': 'USA Today',
  'latimes.com': 'Los Angeles Times', 'wsj.com': 'The Wall Street Journal',
  'independent.co.uk': 'The Independent', 'telegraph.co.uk': 'The Telegraph',
  'dw.com': 'Deutsche Welle', 'euronews.com': 'Euronews', 'scmp.com': 'South China Morning Post'
};

// The offbeat lane should never be grim. This is a hard filter, not a preference.
export const GRIM = /\b(kill(ed|ing)?|murder(ed|s)?|dead|death(s)?|died|corpse|body found|shoot(ing|s)?|shot dead|stabb(ed|ing)|rape[ds]?|assault(ed)?|abuse[ds]?|massacre|suicide|overdose|fatal(ly)?|crash(es)?|manslaughter|homicide|torture[ds]?|kidnap(ped|ping)?|missing (boy|girl|child|toddler)|remains found|war crime|genocide|terror(ist|ism)?)\b/i;
