import React from 'react';
import { List } from 'react-window';
import { AutoSizer } from 'react-virtualized-auto-sizer';

interface VirtualListProps<T> {
    items: T[];
    itemHeight: number;
    renderItem: (item: T, index: number) => React.ReactNode;
    overscanCount?: number;
}

const VirtualList = <T,>({ items, itemHeight, renderItem, overscanCount = 5 }: VirtualListProps<T>) => {
    return (
        <div style={{ height: '100%', width: '100%', minHeight: '400px' }}>
            <AutoSizer Child={({ height, width }) => (
                <List
                    rowCount={items.length}
                    rowHeight={itemHeight}
                    // react-window 2.x uses style prop for dimensions
                    style={{ height: height || 400, width: width || '100%' }}
                    overscanCount={overscanCount}
                    rowComponent={({ index, style }) => (
                        <div style={style}>
                            {renderItem(items[index], index)}
                        </div>
                    )}
                    rowProps={{}}
                />
            )} />
        </div>
    );
};

export default VirtualList;
