module.exports = {
  ci: {
    collect: {
      staticDistDir: 'dist',
      url: ['http://localhost:3000/'],
      numberOfRuns: 1,
      settings: {
        chromeFlags: ['--headless=new', '--no-sandbox', '--disable-gpu', '--disable-dev-shm-usage'],
        maxWaitForFcp: 60000,
        maxWaitForLoad: 60000,
      },
    },
    assert: {
      assertions: {
        'categories:performance': ['warn', { minScore: 0.65 }],
        'categories:accessibility': ['error', { minScore: 0.9 }],
        'categories:best-practices': ['warn', { minScore: 0.9 }],
        'categories:seo': ['warn', { minScore: 0.9 }],
      },
    },
    upload: {
      target: 'temporary-public-storage',
    },
  },
};
