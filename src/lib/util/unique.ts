export default function unique<T>(inp: T[]) {
	return [...new Set<T>(inp)];
}
