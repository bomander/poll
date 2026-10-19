export type PollType = 'multiple_choice' | 'word_cloud';

export type PollOption = { id: number; option_text: string };

export type PollQuestion = {
    id: number;
    question_text: string;
    options: PollOption[];
};

export type Poll = {
    id: number;
    title: string;
    description?: string | null;
    type?: PollType;
    questions: PollQuestion[];
    sessions_count: number;
};

export type MultipleChoiceResult = {
    option_id: number;
    option_text: string;
    count: number;
    percent: number;
};

export type WordCloudResult = {
    answer_text: string;
    count: number;
    percent: number;
    hidden?: boolean;
};

export type Results = MultipleChoiceResult[] | WordCloudResult[];

/** Det elever och projektorn får från /api/join och efter en röst. */
export type ParticipantState = {
    code?: string;
    session_id: number;
    status: 'active' | 'closed';
    locked: boolean;
    show_results: boolean;
    poll_title: string | null;
    poll_type: PollType;
    current_question: PollQuestion | null;
    /** Den aktuella frågans plats i enkäten, räknat från 1. */
    question_number: number | null;
    question_count: number;
    results: Results;
    total_responses: number;
    has_voted: boolean;
    my_answer: { option_id?: number; answer_text?: string } | null;
};

/** Samma färg och bokstav för ett alternativ i elevvy, lärarvy och projektor. */
export const OPTION_COLORS = [
    '#2563EB', // blå
    '#D97706', // bärnsten
    '#059669', // smaragd
    '#DB2777', // rosa
    '#7C3AED', // violett
    '#DC2626', // röd
    '#0891B2', // cyan
    '#EA580C', // orange
];

export function optionColor(index: number): string {
    return OPTION_COLORS[index % OPTION_COLORS.length];
}

export function optionLetter(index: number): string {
    return String.fromCharCode(65 + index);
}

/** Visar en kod som "ABC 123" så att den blir lättare att läsa av på tavlan. */
export function formatCode(code: string): string {
    return code.length === 6 ? `${code.slice(0, 3)} ${code.slice(3)}` : code;
}

export function normalizeCode(input: string): string {
    return input.replace(/[^a-z0-9]/gi, '').toUpperCase();
}

export const WORD_CLOUD_MAX_LENGTH = 60;
