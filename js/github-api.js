// GitHub API Integration for Direct Repository Updates
class GitHubAPI {
    constructor() {
        // GitHub repository information
        this.owner = 'Hussein5645';
        this.repo = 'AIAS-BASRA-WEBSITE';
        this.branch = 'main';
        
        // GitHub Personal Access Token - should be set by admin
        this.token = localStorage.getItem('github_token') || '';
    }

    /**
     * Set the GitHub Personal Access Token
     * @param {string} token - GitHub Personal Access Token
     */
    setToken(token) {
        this.token = token;
        localStorage.setItem('github_token', token);
    }

    /**
     * Get the current token
     * @returns {string} Current GitHub token
     */
    getToken() {
        return this.token;
    }

    /**
     * Check if token is configured
     * @returns {boolean} Whether token is set
     */
    hasToken() {
        return !!this.token && this.token.length > 0;
    }

    /**
     * Get file content from GitHub
     * @param {string} path - File path in repository
     * @returns {Promise<object>} File content and metadata
     */
    async getFileContent(path) {
        const url = `https://api.github.com/repos/${this.owner}/${this.repo}/contents/${path}?ref=${this.branch}`;
        
        const response = await fetch(url, {
            headers: {
                'Authorization': `token ${this.token}`,
                'Accept': 'application/vnd.github.v3+json'
            }
        });

        if (!response.ok) {
            throw new Error(`Failed to get file: ${response.status} ${response.statusText}`);
        }

        const data = await response.json();
        
        // Decode base64 content
        const content = atob(data.content.replace(/\n/g, ''));
        
        return {
            content: content,
            sha: data.sha
        };
    }

    /**
     * Update file in GitHub repository
     * @param {string} path - File path in repository
     * @param {string} content - New file content
     * @param {string} message - Commit message
     * @param {string} sha - Current file SHA (required for updates)
     * @returns {Promise<object>} Update result
     */
    async updateFile(path, content, message, sha) {
        const url = `https://api.github.com/repos/${this.owner}/${this.repo}/contents/${path}`;
        
        // Encode content to base64
        const encodedContent = btoa(unescape(encodeURIComponent(content)));
        
        const response = await fetch(url, {
            method: 'PUT',
            headers: {
                'Authorization': `token ${this.token}`,
                'Accept': 'application/vnd.github.v3+json',
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                message: message,
                content: encodedContent,
                sha: sha,
                branch: this.branch
            })
        });

        if (!response.ok) {
            const error = await response.json();
            throw new Error(`Failed to update file: ${response.status} - ${error.message || response.statusText}`);
        }

        return await response.json();
    }

    /**
     * Update data.json file with new content
     * @param {object} newData - Updated data object
     * @param {string} commitMessage - Commit message
     * @returns {Promise<object>} Update result
     */
    async updateDataJson(newData, commitMessage) {
        const filePath = 'data/data.json';
        
        try {
            // Get current file to get its SHA
            const fileInfo = await this.getFileContent(filePath);
            
            // Format JSON with proper indentation
            const newContent = JSON.stringify(newData, null, 2);
            
            // Update the file
            const result = await this.updateFile(
                filePath,
                newContent,
                commitMessage,
                fileInfo.sha
            );
            
            return {
                success: true,
                result: result
            };
        } catch (error) {
            return {
                success: false,
                error: error.message
            };
        }
    }

    /**
     * Add new event to data.json
     * @param {object} event - Event object to add
     * @returns {Promise<object>} Update result
     */
    async addEvent(event) {
        try {
            // Get current data
            const fileInfo = await this.getFileContent('data/data.json');
            const data = JSON.parse(fileInfo.content);
            
            // Add new event
            data.events.push(event);
            
            // Update file
            return await this.updateDataJson(
                data,
                `Add new event: ${event.title}`
            );
        } catch (error) {
            return {
                success: false,
                error: error.message
            };
        }
    }

    /**
     * Add new magazine article to data.json
     * @param {object} article - Article object to add
     * @returns {Promise<object>} Update result
     */
    async addArticle(article) {
        try {
            // Get current data
            const fileInfo = await this.getFileContent('data/data.json');
            const data = JSON.parse(fileInfo.content);
            
            // Add new article
            data.magazine.articles.push(article);
            
            // Update file
            return await this.updateDataJson(
                data,
                `Add new article: ${article.title}`
            );
        } catch (error) {
            return {
                success: false,
                error: error.message
            };
        }
    }

    /**
     * Add new library resource to data.json
     * @param {object} resource - Library resource object to add
     * @returns {Promise<object>} Update result
     */
    async addLibraryResource(resource) {
        try {
            // Get current data
            const fileInfo = await this.getFileContent('data/data.json');
            const data = JSON.parse(fileInfo.content);
            
            // Add new resource
            data.library.push(resource);
            
            // Update file
            return await this.updateDataJson(
                data,
                `Add new library resource: ${resource.name}`
            );
        } catch (error) {
            return {
                success: false,
                error: error.message
            };
        }
    }

    /**
     * Update education content in data.json
     * @param {object} education - Education content object
     * @returns {Promise<object>} Update result
     */
    async updateEducation(education) {
        try {
            // Get current data
            const fileInfo = await this.getFileContent('data/data.json');
            const data = JSON.parse(fileInfo.content);
            
            // Update education content
            data.education.weeklyWorkshop = education;
            
            // Update file
            return await this.updateDataJson(
                data,
                `Update education content: ${education.weekTitle}`
            );
        } catch (error) {
            return {
                success: false,
                error: error.message
            };
        }
    }
}

// Export for use in other scripts
window.GitHubAPI = GitHubAPI;
