import { Relay } from '../relay';
import { UseRelay } from './use-relay';
import { Fallback } from './fallback';
import { RelayOpenError } from '../errors';
import { RelayClass } from './relay-class';
import { FallbackClass } from './fallback-class';

jest.useFakeTimers();

describe('Decorators', () => {
  let relay: Relay;

  beforeEach(() => {
    relay = new Relay({ failureThreshold: 2, coolDownPeriod: 1000 });
  });

  afterEach(() => {
    relay.cleanup();
    Relay.clearDefault();
    jest.clearAllTimers();
  });

  it('should protect a method with @UseRelay', async () => {
    class TestService {
      @UseRelay(relay)
      async successMethod() {
        return 'success';
      }

      @UseRelay(relay)
      async failMethod() {
        throw new Error('fail');
      }
    }

    const service = new TestService();

    await expect(service.successMethod()).resolves.toBe('success');

    await expect(service.failMethod()).rejects.toThrow('fail');
    await expect(service.failMethod()).rejects.toThrow('fail');
    
    await expect(service.failMethod()).rejects.toThrow(RelayOpenError);
  });

  it('should preserve "this" context in @UseRelay', async () => {
    class ContextService {
      constructor(private value: string) {}

      @UseRelay(relay)
      async getValue() {
        return this.value;
      }
    }

    const service = new ContextService('test-value');
    await expect(service.getValue()).resolves.toBe('test-value');
  });

  it('should use @Fallback when method fails', async () => {
    class FallbackService {
      @Fallback('fallbackMethod')
      @UseRelay(relay)
      async failMethod() {
        throw new Error('fail');
      }

      async fallbackMethod() {
        return 'fallback-executed';
      }
    }

    const service = new FallbackService();
    await expect(service.failMethod()).resolves.toBe('fallback-executed');
  });

  it('should use @Fallback with a standalone function', async () => {
    const fallbackFn = jest.fn(() => 'standalone-fallback');

    class StandaloneFallbackService {
      @Fallback(fallbackFn)
      @UseRelay(relay)
      async failMethod() {
        throw new Error('fail');
      }
    }

    const service = new StandaloneFallbackService();
    await expect(service.failMethod()).resolves.toBe('standalone-fallback');
    expect(fallbackFn).toHaveBeenCalled();
  });

  it('should pass arguments to fallback', async () => {
    class ArgsService {
      @Fallback('fallbackMethod')
      @UseRelay(relay)
      async failMethod(_: string, __: number) {
        throw new Error('fail');
      }

      async fallbackMethod(error: Error, arg1: string, arg2: number) {
        return `fallback-${arg1}-${arg2}`;
      }
    }

    const service = new ArgsService();
    await expect(service.failMethod('test', 123)).resolves.toBe('fallback-test-123');
  });
});

describe('Class Decorators', () => {
  let relay: Relay;

  beforeEach(() => {
    relay = new Relay({ failureThreshold: 2, coolDownPeriod: 1000 });
  });

  afterEach(() => {
    relay.cleanup();
  });

  it('should protect all methods with @RelayClass', async () => {

    @RelayClass(relay)
    class TestService {
      async method1() {
        return 'success1';
      }

      async method2() {
        throw new Error('fail');
      }
    }

    const service = new TestService();

    await expect(service.method1()).resolves.toBe('success1');
    await expect(service.method2()).rejects.toThrow('fail');
    await expect(service.method2()).rejects.toThrow('fail');
    
    await expect(service.method2()).rejects.toThrow(RelayOpenError);
  });

  it('should NOT wrap synchronous methods when using @RelayClass', () => {
    @RelayClass(relay)
    class TestService {
      syncMethod() {
        return 'sync-result';
      }
      
      async asyncMethod() {
        return 'async-result';
      }
    }

    const service = new TestService();
    
    // Synchronous method should return value directly, not a Promise
    const result = service.syncMethod();
    expect(result).toBe('sync-result');
    
    // Async method should be wrapped and return a Promise
    expect(service.asyncMethod()).toBeInstanceOf(Promise);
  });

  it('should use fallback class with @FallbackClass', async () => {

    class FallbackService {
      async getData() {
        return 'fallback-data';
      }
    }

    @FallbackClass(FallbackService)
    class PrimaryService {
      async getData() {
        throw new Error('fail');
      }
    }

    const service = new PrimaryService();
    await expect(service.getData()).resolves.toBe('fallback-data');
  });

  it('should combine @RelayClass and @FallbackClass', async () => {
    class FallbackService {
      async riskyMethod(_: Error, value: string) {
        return `fallback-${value}`;
      }
    }

    @RelayClass(relay)
    @FallbackClass(FallbackService)
    class PrimaryService {
      async riskyMethod(_value: string) {
        throw new Error('fail');
      }
    }

    const service = new PrimaryService();
    await expect(service.riskyMethod('test')).resolves.toBe('fallback-test');
  });
});

describe('Default Relay Instance', () => {
  afterEach(() => {
    Relay.clearDefault();
    jest.clearAllTimers();
  });

  it('should set and get default instance', () => {
    const relay = new Relay();
    Relay.setDefault(relay);
    
    expect(Relay.getDefault()).toBe(relay);
  });

  it('should throw error when getting default without setting it', () => {
    expect(() => Relay.getDefault()).toThrow(
      'No default Relay instance set. Use Relay.setDefault() first or provide a Relay instance to the decorator.'
    );
  });

  it('should clear default instance', () => {
    const relay = new Relay();
    Relay.setDefault(relay);
    Relay.clearDefault();
    
    expect(() => Relay.getDefault()).toThrow();
  });

  it('should use default instance in @UseRelay without arguments', async () => {
    const relay = new Relay({ failureThreshold: 2 });
    Relay.setDefault(relay);

    class TestService {
      @UseRelay() 
      async successMethod() {
        return 'success';
      }
    }

    const service = new TestService();
    await expect(service.successMethod()).resolves.toBe('success');
  });

  it('should throw error when using @UseRelay without default instance', () => {
    expect(() => {
      @UseRelay() 
      class TestService {
        async method() {
          return 'test';
        }
      }
      return TestService;
    }).toThrow('No default Relay instance set');
  });

  it('should allow multiple classes to share default instance', async () => {
    const relay = new Relay({ failureThreshold: 2 });
    Relay.setDefault(relay);

    class Service1 {
      @UseRelay()
      async method1() {
        return 'service1';
      }
    }

    class Service2 {
      @UseRelay()
      async method2() {
        return 'service2';
      }
    }

    const s1 = new Service1();
    const s2 = new Service2();

    await expect(s1.method1()).resolves.toBe('service1');
    await expect(s2.method2()).resolves.toBe('service2');
  });
});

describe('Class-level @UseRelay', () => {
  let relay: Relay;

  beforeEach(() => {
    relay = new Relay({ failureThreshold: 2, coolDownPeriod: 1000 });
  });

  afterEach(() => {
    relay.cleanup();
    Relay.clearDefault();
    jest.clearAllTimers();
  });

  it('should protect all methods when applied to a class', async () => {
    @UseRelay(relay)
    class TestService {
      async method1() {
        return 'success1';
      }

      async method2() {
        return 'success2';
      }
    }

    const service = new TestService();

    await expect(service.method1()).resolves.toBe('success1');
    await expect(service.method2()).resolves.toBe('success2');
  });

  it('should open circuit when class method fails threshold times', async () => {
    @UseRelay(relay)
    class TestService {
      async failMethod() {
        throw new Error('fail');
      }
    }

    const service = new TestService();

    await expect(service.failMethod()).rejects.toThrow('fail');
    await expect(service.failMethod()).rejects.toThrow('fail');
    
    await expect(service.failMethod()).rejects.toThrow(RelayOpenError);
  });

  it('should preserve "this" context in class-level decoration', async () => {
    @UseRelay(relay)
    class ContextService {
      constructor(private value: string) {}

      async getValue() {
        return this.value;
      }
    }

    const service = new ContextService('test-value');
    await expect(service.getValue()).resolves.toBe('test-value');
  });

  it('should not wrap the constructor', async () => {
    @UseRelay(relay)
    class TestService {
      constructor(public value: string) {}

      async getValue() {
        return this.value;
      }
    }

    const service = new TestService('test');
    expect(service.value).toBe('test');
    await expect(service.getValue()).resolves.toBe('test');
  });

  it('should work with default instance on class', async () => {
    Relay.setDefault(relay);

    @UseRelay()
    class TestService {
      async method1() {
        return 'success';
      }

      async method2() {
        return 'success2';
      }
    }

    const service = new TestService();

    await expect(service.method1()).resolves.toBe('success');
    await expect(service.method2()).resolves.toBe('success2');
  });

  it('should combine class-level @UseRelay with method-level @Fallback', async () => {
    @UseRelay(relay)
    class TestService {
      @Fallback('fallbackMethod')
      async riskyMethod() {
        throw new Error('fail');
      }

      async fallbackMethod(_: Error) {
        return 'fallback-executed';
      }
    }

    const service = new TestService();
    await expect(service.riskyMethod()).resolves.toBe('fallback-executed');
  });
  it('should NOT wrap synchronous methods when applied to a class', () => {
    @UseRelay(relay)
    class TestService {
      syncMethod() {
        return 'sync-result';
      }
      
      async asyncMethod() {
        return 'async-result';
      }
    }

    const service = new TestService();
    
    // Synchronous method should return value directly, not a Promise
    const result = service.syncMethod();
    expect(result).toBe('sync-result');
    
    // Async method should be wrapped and return a Promise
    expect(service.asyncMethod()).toBeInstanceOf(Promise);
  });

  it('should instantiate fallback class only once per instance', async () => {
    let constructorCount = 0;

    class FallbackService {
      constructor() {
        constructorCount++;
      }
      async getData() {
        return 'fallback';
      }
    }

    @FallbackClass(FallbackService)
    class PrimaryService {
      async getData() {
        throw new Error('fail');
      }
    }

    const service = new PrimaryService();
    
    // First failure
    await service.getData();
    expect(constructorCount).toBe(1);

    await service.getData();
    expect(constructorCount).toBe(1);
  });

  it('should NOT wrap synchronous methods when using @FallbackClass', () => {
    class FallbackService {
      syncMethod() { return 'fallback-sync'; }
      async asyncMethod() { return 'fallback-async'; }
    }

    @FallbackClass(FallbackService)
    class PrimaryService {
      syncMethod() {
        return 'sync-result';
      }
      
      async asyncMethod() {
        return 'async-result';
      }
    }

    const service = new PrimaryService();
    
    // Synchronous method should return value directly, not a Promise
    const result = service.syncMethod();
    expect(result).toBe('sync-result');
    
    // Async method should be wrapped and return a Promise
    expect(service.asyncMethod()).toBeInstanceOf(Promise);
  });

  it('should throw original error if fallback method does not exist in FallbackClass', async () => {
    class FallbackService {
      // No getData method
    }

    @FallbackClass(FallbackService)
    class PrimaryService {
      async getData() {
        throw new Error('original-error');
      }
    }

    const service = new PrimaryService();
    await expect(service.getData()).rejects.toThrow('original-error');
  });
});

describe('Fallback Decorator Edge Cases', () => {
  it('should throw error if fallback method string is not found', async () => {
    class TestService {
      @Fallback('nonExistentMethod')
      async failMethod() {
        throw new Error('fail');
      }
    }

    const service = new TestService();
    await expect(service.failMethod()).rejects.toThrow("Fallback method 'nonExistentMethod' not found on instance");
  });

  it('should rethrow error if fallback argument is invalid', async () => {
    class TestService {
      @Fallback(123 as any)
      async failMethod() {
        throw new Error('fail');
      }
    }

    const service = new TestService();
    await expect(service.failMethod()).rejects.toThrow('fail');
  });
});
