module.exports = {
    ci: {
        collect: {
            startServerCommand: 'npm run preview',
            url: ['http://localhost:3000/'],
            numberOfRuns: 1,
        },
        assert: {
            assertions: {
                'categories:performance': ['warn', { minScore: 0.9 }],
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
