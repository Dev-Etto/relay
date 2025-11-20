import { Relay } from '../relay';

/**
 * Decorator to protect a method or all methods in a class with a Relay (Circuit Breaker).
 * 
 * When applied to a method:
 * - Wraps the method with relay.run()
 * 
 * When applied to a class:
 * - Wraps all async methods in the class with relay.run()
 * 
 * @param relay Optional Relay instance. If not provided, uses Relay.getDefault().
 * 
 * @example
 * // Method decoration
 * class ApiService {
 *   @UseRelay(myRelay)
 *   async fetchData() { ... }
 * }
 * 
 * @example
 * // Class decoration
 * @UseRelay(myRelay)
 * class ApiService {
 *   async method1() { ... } // Protected
 *   async method2() { ... } // Protected
 * }
 * 
 * @example
 * // Using default instance
 * Relay.setDefault(myRelay);
 * 
 * @UseRelay() // No argument needed
 * class ApiService {
 *   async fetchData() { ... }
 * }
 */
export function UseRelay(relay?: Relay): any {
  return function (
    target: any,
    propertyKey?: string,
    descriptor?: PropertyDescriptor
  ): any {
    const relayInstance = relay || Relay.getDefault();

    if (descriptor && propertyKey) {
      const originalMethod = descriptor.value;

      descriptor.value = async function (...args: any[]) {
        return relayInstance.run(originalMethod.bind(this), ...args);
      };

      return descriptor;
    }

    const prototype = target.prototype;
    const methodNames = Object.getOwnPropertyNames(prototype);

    for (const methodName of methodNames) {
      if (methodName === 'constructor') continue;

      const methodDescriptor = Object.getOwnPropertyDescriptor(prototype, methodName);
      
      if (methodDescriptor && typeof methodDescriptor.value === 'function') {
        const originalMethod = methodDescriptor.value;
        const isAsync = originalMethod.constructor.name === 'AsyncFunction';

        if (isAsync) {
          methodDescriptor.value = async function (...args: any[]) {
            return relayInstance.run(originalMethod.bind(this), ...args);
          };

          Object.defineProperty(prototype, methodName, methodDescriptor);
        }
      }
    }

    return target;
  };
}
