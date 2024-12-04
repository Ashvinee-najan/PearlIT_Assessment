class EmailService {
    constructor(providers) {
      this.providers = providers; // Array of email providers
      this.currentProviderIndex = 0;
      this.sentEmails = new Set(); // Idempotency cache
      this.statusLog = []; // Status tracking
      this.rateLimit = 5; // Max emails per minute
      this.sentCount = 0;
      this.circuitBreaker = false; // For circuit breaker pattern
    }
  
    // Mock providers
    static mockProvider(name, failRate = 0.3) {
      return {
        name,
        send: async (email) => {
          if (Math.random() < failRate) throw new Error(`${name} failed`);
          return true;
        },
      };
    }
  
    // Exponential backoff
    async retryWithBackoff(fn, retries = 3, delay = 1000) {
      let attempt = 0;
      while (attempt <= retries) {
        try {
          return await fn();
        } catch (error) {
          if (attempt === retries) throw error;
          await new Promise((res) => setTimeout(res, delay * Math.pow(2, attempt)));
          attempt++;
        }
      }
    }
  
    // Fallback to next provider
    switchProvider() {
      this.currentProviderIndex = (this.currentProviderIndex + 1) % this.providers.length;
    }
  
    // Idempotency check
    isDuplicate(email) {
      const key = `${email.to}:${email.subject}:${email.body}`;
      return this.sentEmails.has(key);
    }
  
    trackStatus(email, status, providerName) {
      this.statusLog.push({ email, status, provider: providerName, timestamp: new Date() });
    }
  
    // Send email logic
    async sendEmail(email) {
      // Rate limiting
      if (this.sentCount >= this.rateLimit) {
        throw new Error("Rate limit exceeded");
      }
  
      // Idempotency check
      if (this.isDuplicate(email)) {
        console.log("Duplicate email detected, skipping...");
        this.trackStatus(email, "duplicate", null);
        return false;
      }
  
      if (this.circuitBreaker) {
        throw new Error("Circuit breaker active, cannot send email");
      }
  
      const currentProvider = this.providers[this.currentProviderIndex];
      try {
        await this.retryWithBackoff(() => currentProvider.send(email));
        const key = `${email.to}:${email.subject}:${email.body}`;
        this.sentEmails.add(key);
        this.sentCount++;
        this.trackStatus(email, "sent", currentProvider.name);
        console.log(`[SUCCESS] Email sent via ${currentProvider.name}`);
        return true;
      } catch (error) {
        console.error(`[ERROR] ${error.message}`);
        this.trackStatus(email, "failed", currentProvider.name);
        this.switchProvider();
        throw error;
      }
    }
  
    async processQueue(queue) {
      for (const email of queue) {
        try {
          await this.sendEmail(email);
        } catch (error) {
          console.error(`[QUEUE ERROR] Failed to send email: ${error.message}`);
        }
      }
    }
  }
  
  // Mock providers
  const provider1 = EmailService.mockProvider("Provider1", 0.5);
  const provider2 = EmailService.mockProvider("Provider2", 0.3);
  
  // Initialize service
  const emailService = new EmailService([provider1, provider2]);
  
  // Example email queue
  const emailQueue = [
    { to: "ashvinee.najan@gmail.com", subject: "Hello", body: "Message 1" },
    { to: "ashvinee.najan@gmail.com", subject: "Hi", body: "Message 2" },
  ];
  
  // Process the queue
  emailService.processQueue(emailQueue);
  
  module.exports = EmailService;
  