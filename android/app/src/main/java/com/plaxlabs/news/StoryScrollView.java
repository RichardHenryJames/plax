package com.plaxlabs.news;

import android.content.Context;
import android.view.MotionEvent;
import android.widget.ScrollView;

final class StoryScrollView extends ScrollView {
    private float down;
    StoryScrollView(Context context) { super(context); }

    @Override public boolean dispatchTouchEvent(MotionEvent event) {
        if (event.getActionMasked() == MotionEvent.ACTION_DOWN) {
            down = event.getY();
            getParent().requestDisallowInterceptTouchEvent(true);
        } else if (event.getActionMasked() == MotionEvent.ACTION_MOVE) {
            // Long summaries scroll first; only a gesture at their edge changes stories.
            int direction = event.getY() < down ? 1 : -1;
            getParent().requestDisallowInterceptTouchEvent(canScrollVertically(direction));
        } else if (event.getActionMasked() == MotionEvent.ACTION_UP || event.getActionMasked() == MotionEvent.ACTION_CANCEL) {
            getParent().requestDisallowInterceptTouchEvent(false);
        }
        return super.dispatchTouchEvent(event);
    }
}
