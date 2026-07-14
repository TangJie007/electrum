import { META } from '../constants/metadata-keys'

export function Controller(prefix = '') {
  return (_target: Function, context: ClassDecoratorContext): void => {
    context.metadata![META.CONTROLLER] = { prefix }
  }
}
