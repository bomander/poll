declare module 'wordcloud' {
    type WordCloudEngine = (
        canvas: HTMLCanvasElement,
        options: Record<string, unknown>,
    ) => void;

    const WordCloud: WordCloudEngine & { stop?: () => void };
    export default WordCloud;
}
