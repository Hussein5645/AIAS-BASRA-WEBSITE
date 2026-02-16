import dataLoader from './data-loader.js';

function slugifyCategory(value) {
    return String(value || '')
        .trim()
        .toLowerCase()
        .replace(/\s+/g, '-')
        .replace(/[^a-z0-9-_]/g, '');
}

export function normalizeLibraryItem(item, index = 0) {
    const name = item?.name || item?.title || `Resource ${index + 1}`;
    const description = item?.description || '';
    const type = item?.type || 'Resource';
    const category = item?.category || 'file';
    const tags = Array.isArray(item?.tags) ? item.tags.filter(Boolean) : [];
    const date = item?.date || item?.createdAt || new Date().toISOString();
    const views = Number(item?.views || 0);

    const icon = item?.icon || (
        String(type).toLowerCase().includes('lecture') || String(category).toLowerCase().includes('lecture')
            ? '🎓'
            : '📚'
    );

    return {
        id: item?.id || `library-${index + 1}`,
        name,
        title: name,
        description,
        type,
        category,
        categoryKey: slugifyCategory(category),
        tags,
        date,
        views,
        icon,
        image: item?.image || '',
        imageUrl: item?.imageUrl || '',
        link: item?.link || ''
    };
}

export function normalizeModel3D(model, index = 0) {
    return {
        id: model?.id || `model-${index + 1}`,
        name: model?.name || `Model ${index + 1}`,
        code: String(model?.code || '').trim(),
        date: model?.date || model?.createdAt || '',
        tags: Array.isArray(model?.tags) ? model.tags.filter(Boolean) : []
    };
}

export function buildFacetCounts(items) {
    const categoryCounts = new Map();
    const tagCounts = new Map();

    items.forEach(item => {
        const category = item?.category;
        if (category) {
            categoryCounts.set(category, (categoryCounts.get(category) || 0) + 1);
        }

        const tags = Array.isArray(item?.tags) ? item.tags : [];
        tags.forEach(tag => {
            if (!tag) return;
            tagCounts.set(tag, (tagCounts.get(tag) || 0) + 1);
        });
    });

    return { categoryCounts, tagCounts };
}

export async function fetchLibraryBundle(forceRefresh = false) {
    const result = await dataLoader.fetchData(forceRefresh);

    if (!result.success) {
        throw new Error(result.error || 'Failed to fetch library bundle');
    }

    const rawLibrary = Array.isArray(result?.data?.library) ? result.data.library : [];
    const rawModels = Array.isArray(result?.data?.models3d) ? result.data.models3d : [];

    const libraryItems = rawLibrary.map((item, index) => normalizeLibraryItem(item, index));
    const models3d = rawModels
        .map((model, index) => normalizeModel3D(model, index))
        .filter(model => model.code.length === 10);

    return {
        libraryItems,
        models3d,
        fromCache: !!result.fromCache
    };
}
